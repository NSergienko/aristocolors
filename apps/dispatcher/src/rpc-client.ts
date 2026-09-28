import {
  PythonMlRpcRequestSchema,
  PythonMlRpcResponseSchema,
  PythonMlRuntimeHealthSchema,
  type PythonMlRpcRequest,
  type PythonMlRpcResponse,
  type PythonMlRuntimeHealth,
} from '@aristocolors/contracts';
import type { DispatcherConfig } from './config';

export interface PythonMlRpcClientOptions {
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  retryInitialDelayMs: number;
}

export class PythonMlExecutionError extends Error {
  public readonly name = 'PythonMlExecutionError';
  public readonly taskId: string;
  public readonly executionTimeMs: number;
  public readonly runtimeError: string | null;
  public readonly response: PythonMlRpcResponse;

  constructor(response: PythonMlRpcResponse) {
    super(response.error ?? `Python ML execution failed for task ${response.taskId}`);
    this.taskId = response.taskId;
    this.executionTimeMs = response.executionTimeMs;
    this.runtimeError = response.error;
    this.response = response;
  }
}

export class PythonMlTransportError extends Error {
  public readonly name = 'PythonMlTransportError';
  public readonly statusCode?: number;
  public readonly responseBody?: string;
  public readonly cause?: unknown;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      responseBody?: string;
      cause?: unknown;
    },
  ) {
    super(message);
    this.statusCode = options?.statusCode;
    this.responseBody = options?.responseBody;
    this.cause = options?.cause;
  }
}

export class PythonMlRpcClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryInitialDelayMs: number;

  constructor(options: PythonMlRpcClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.timeoutMs = options.timeoutMs;
    this.maxRetries = options.maxRetries;
    this.retryInitialDelayMs = options.retryInitialDelayMs;
  }

  static fromConfig(config: DispatcherConfig): PythonMlRpcClient {
    return new PythonMlRpcClient({
      baseUrl: config.pythonMlBaseUrl,
      timeoutMs: config.rpcTimeoutMs,
      maxRetries: config.maxRetries,
      retryInitialDelayMs: config.retryInitialDelayMs,
    });
  }

  async getHealth(timeoutMs = this.timeoutMs): Promise<PythonMlRuntimeHealth> {
    const response = await this.fetchWithTimeout(this.buildUrl('/health'), {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
    }, timeoutMs);

    if (!response.ok) {
      const responseBody = await readResponseBody(response);
      throw new PythonMlTransportError(
        `Python ML health check failed with status ${response.status}`,
        {
          statusCode: response.status,
          responseBody,
        },
      );
    }

    const payload = await response.json();
    return PythonMlRuntimeHealthSchema.parse(payload);
  }

  async compute(
    request: PythonMlRpcRequest,
    timeoutMs = this.timeoutMs,
  ): Promise<PythonMlRpcResponse> {
    const validatedRequest = PythonMlRpcRequestSchema.parse(request);

    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      try {
        const response = await this.fetchWithTimeout(
          this.buildUrl('/rpc/v1/compute'),
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json',
            },
            body: JSON.stringify(validatedRequest),
          },
          timeoutMs,
        );

        if (response.status >= 500) {
          const responseBody = await readResponseBody(response);
          throw new PythonMlTransportError(
            `Python ML RPC failed with status ${response.status}`,
            {
              statusCode: response.status,
              responseBody,
            },
          );
        }

        if (!response.ok) {
          const responseBody = await readResponseBody(response);
          throw new PythonMlTransportError(
            `Python ML RPC request rejected with status ${response.status}`,
            {
              statusCode: response.status,
              responseBody,
            },
          );
        }

        const payload = await response.json();
        const validatedResponse = PythonMlRpcResponseSchema.parse(payload);

        if (validatedResponse.status === 'failed') {
          throw new PythonMlExecutionError(validatedResponse);
        }

        return validatedResponse;
      } catch (error) {
        if (error instanceof PythonMlExecutionError) {
          throw error;
        }

        if (!shouldRetry(error) || attempt === this.maxRetries) {
          throw error;
        }

        lastError = error;
        await sleep(getBackoffDelayMs(this.retryInitialDelayMs, attempt));
        attempt += 1;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Python ML RPC failed after retries');
  }

  private buildUrl(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private async fetchWithTimeout(
    input: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new PythonMlTransportError(`Python ML RPC timed out after ${timeoutMs}ms`, {
          cause: error,
        });
      }

      throw new PythonMlTransportError('Python ML RPC transport error', {
        cause: error,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function shouldRetry(error: unknown): boolean {
  if (!(error instanceof PythonMlTransportError)) {
    return false;
  }

  if (error.statusCode === undefined) {
    return true;
  }

  return error.statusCode >= 500;
}

function getBackoffDelayMs(initialDelayMs: number, attempt: number): number {
  return initialDelayMs * Math.pow(2, attempt);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function readResponseBody(response: Response): Promise<string | undefined> {
  const text = await response.text();
  return text.length > 0 ? text : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
