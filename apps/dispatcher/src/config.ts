export interface DispatcherConfig {
  queueName: string;
  pythonMlHost: string;
  pythonMlPort: number;
  pythonMlBaseUrl: string;
  redisHost: string;
  redisPort: number;
  redisUrl: string;
  rpcTimeoutMs: number;
  maxRetries: number;
  retryInitialDelayMs: number;
  keepAliveTimeoutMs: number;
}

export const defaultDispatcherConfig: DispatcherConfig = {
  queueName: 'generation-jobs',
  pythonMlHost: '127.0.0.1',
  pythonMlPort: 8000,
  pythonMlBaseUrl: 'http://127.0.0.1:8000',
  redisHost: '127.0.0.1',
  redisPort: 6379,
  redisUrl: 'redis://127.0.0.1:6379',
  rpcTimeoutMs: 30000,
  maxRetries: 3,
  retryInitialDelayMs: 500,
  keepAliveTimeoutMs: 30000,
};

function readStringEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readIntEnv(name: string): number | undefined {
  const value = readStringEnv(name);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer environment variable: ${name}`);
  }

  return parsed;
}

export function loadDispatcherConfig(): DispatcherConfig {
  const queueName = readStringEnv('DISPATCHER_QUEUE_NAME') ?? defaultDispatcherConfig.queueName;

  const pythonMlHost = readStringEnv('PYTHON_ML_HOST') ?? defaultDispatcherConfig.pythonMlHost;
  const pythonMlPort = readIntEnv('PYTHON_ML_PORT') ?? defaultDispatcherConfig.pythonMlPort;
  const pythonMlBaseUrl =
    readStringEnv('PYTHON_ML_BASE_URL') ?? `http://${pythonMlHost}:${pythonMlPort}`;

  const redisHost = readStringEnv('REDIS_HOST') ?? defaultDispatcherConfig.redisHost;
  const redisPort = readIntEnv('REDIS_PORT') ?? defaultDispatcherConfig.redisPort;
  const redisUrl = readStringEnv('REDIS_URL') ?? `redis://${redisHost}:${redisPort}`;

  const rpcTimeoutMs = readIntEnv('DISPATCHER_RPC_TIMEOUT_MS') ?? defaultDispatcherConfig.rpcTimeoutMs;
  const maxRetries = readIntEnv('DISPATCHER_MAX_RETRIES') ?? defaultDispatcherConfig.maxRetries;
  const retryInitialDelayMs =
    readIntEnv('DISPATCHER_RETRY_INITIAL_DELAY_MS') ?? defaultDispatcherConfig.retryInitialDelayMs;
  const keepAliveTimeoutMs =
    readIntEnv('DISPATCHER_KEEP_ALIVE_TIMEOUT_MS') ?? defaultDispatcherConfig.keepAliveTimeoutMs;

  return {
    queueName,
    pythonMlHost,
    pythonMlPort,
    pythonMlBaseUrl,
    redisHost,
    redisPort,
    redisUrl,
    rpcTimeoutMs,
    maxRetries,
    retryInitialDelayMs,
    keepAliveTimeoutMs,
  };
}
