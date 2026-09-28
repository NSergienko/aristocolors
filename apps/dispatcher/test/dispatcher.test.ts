import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import {
  GenerationJobPayloadSchema,
  type GenerationJobPayload,
  type PythonMlRpcRequest,
  type PythonMlRpcResponse,
} from '@aristocolors/contracts';
import {
  defaultDispatcherConfig,
  DispatcherGenerationQueue,
  DuplicateActiveExecutionError,
  IdempotencyLockManager,
  PythonMlExecutionError,
  PythonMlRpcClient,
} from '../src';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Assertion failed: ${message}. Expected ${expectedJson}, got ${actualJson}`);
  }
}

async function assertRejects(
  fn: () => Promise<unknown>,
  predicate: (error: unknown) => void | Promise<void>,
  message: string,
): Promise<void> {
  let didThrow = false;

  try {
    await fn();
  } catch (error) {
    didThrow = true;
    await predicate(error);
  }

  if (!didThrow) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function createTestPayload(overrides: Partial<GenerationJobPayload> = {}): GenerationJobPayload {
  const base = {
    jobId: 'job-123',
    idempotencyKey: 'idem-123',
  } as unknown as GenerationJobPayload;

  const payload = {
    ...base,
    ...overrides,
  } as GenerationJobPayload;

  return GenerationJobPayloadSchema.parse(payload);
}

async function startMockServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer(async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: String(error) }));
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

class MockRpcClient {
  public computeCalls: Array<{ request: PythonMlRpcRequest; timeoutMs?: number }> = [];
  public response: PythonMlRpcResponse | null = null;
  public error: unknown = null;

  async compute(request: PythonMlRpcRequest, timeoutMs?: number): Promise<PythonMlRpcResponse> {
    this.computeCalls.push({ request, timeoutMs });

    if (this.error) {
      throw this.error;
    }

    if (!this.response) {
      throw new Error('MockRpcClient.response not configured');
    }

    return this.response;
  }
}

class MockQueue<TData> {
  public addCalls: Array<{
    name: string;
    data: TData;
    options?: Record<string, unknown>;
  }> = [];

  async add(name: string, data: TData, options?: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.addCalls.push({ name, data, options });
    return {
      id: options?.jobId ?? null,
      name,
      data,
      opts: options,
    };
  }
}

type ProgressValue = number;

class MockJob<TData> {
  public readonly data: TData;
  public readonly progressCalls: ProgressValue[] = [];

  constructor(data: TData) {
    this.data = data;
  }

  async updateProgress(progress: ProgressValue): Promise<void> {
    this.progressCalls.push(progress);
  }
}

async function runWorkerProcessJob(
  worker: unknown,
  job: unknown,
): Promise<unknown> {
  const candidate = worker as {
    processJob?: (job: unknown) => Promise<unknown>;
  };

  if (typeof candidate.processJob !== 'function') {
    throw new Error('processJob is not available');
  }

  return candidate.processJob(job);
}

async function testPythonMlRpcClientSuccess(): Promise<void> {
  let capturedRequest: unknown = null;

  const server = await startMockServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/rpc/v1/compute') {
      const body = await readRequestBody(req);
      capturedRequest = JSON.parse(body);

      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          taskId: 'task-1',
          status: 'completed',
          result: {
            imageUrl: 'https://example.test/result.png',
          },
          error: null,
          executionTimeMs: 12,
        }),
      );
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  try {
    const client = new PythonMlRpcClient({
      baseUrl: server.baseUrl,
      timeoutMs: 1000,
      maxRetries: 0,
      retryInitialDelayMs: 1,
    });

    const request = {
      taskId: 'task-1',
      idempotencyKey: 'idem-1',
      taskType: 'render_photobash',
      payload: {
        jobId: 'job-1',
        idempotencyKey: 'idem-1',
      },
      timeoutMs: 1000,
    } as unknown as PythonMlRpcRequest;

    const response = await client.compute(request);

    assertEqual(response.taskId, 'task-1', 'RPC client should return parsed response');
    assertEqual(response.status, 'completed', 'RPC client should return completed status');
    assertDeepEqual(capturedRequest, request, 'RPC client should POST validated request body');

    const health = await client.getHealth();
    assertEqual(health.status, 'ok', 'Health endpoint should be parsed');
  } finally {
    await server.close();
  }
}

async function testPythonMlRpcClientTimeout(): Promise<void> {
  const server = await startMockServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/rpc/v1/compute') {
      await sleep(100);
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          taskId: 'task-timeout',
          status: 'completed',
          result: { ok: true },
          error: null,
          executionTimeMs: 100,
        }),
      );
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  try {
    const client = new PythonMlRpcClient({
      baseUrl: server.baseUrl,
      timeoutMs: 10,
      maxRetries: 0,
      retryInitialDelayMs: 1,
    });

    const request = {
      taskId: 'task-timeout',
      idempotencyKey: 'idem-timeout',
      taskType: 'render_photobash',
      payload: {
        jobId: 'job-timeout',
        idempotencyKey: 'idem-timeout',
      },
      timeoutMs: 10,
    } as unknown as PythonMlRpcRequest;

    await assertRejects(
      () => client.compute(request),
      (error) => {
        assert(error instanceof Error, 'Timeout should reject with an Error');
        assert(
          error instanceof Error && error.message.includes('timed out'),
          'Timeout should mention timeout in the error message',
        );
      },
      'RPC timeout should reject',
    );
  } finally {
    await server.close();
  }
}

async function testPythonMlRpcClientExecutionError(): Promise<void> {
  const server = await startMockServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/rpc/v1/compute') {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          taskId: 'task-failed',
          status: 'failed',
          result: null,
          error: 'model execution failed',
          executionTimeMs: 33,
        }),
      );
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  try {
    const client = new PythonMlRpcClient({
      baseUrl: server.baseUrl,
      timeoutMs: 1000,
      maxRetries: 0,
      retryInitialDelayMs: 1,
    });

    const request = {
      taskId: 'task-failed',
      idempotencyKey: 'idem-failed',
      taskType: 'render_photobash',
      payload: {
        jobId: 'job-failed',
        idempotencyKey: 'idem-failed',
      },
      timeoutMs: 1000,
    } as unknown as PythonMlRpcRequest;

    await assertRejects(
      () => client.compute(request),
      (error) => {
        assert(error instanceof PythonMlExecutionError, 'Failed RPC should throw PythonMlExecutionError');
        const execError = error as PythonMlExecutionError;
        assertEqual(execError.taskId, 'task-failed', 'Execution error should preserve taskId');
        assertEqual(execError.runtimeError, 'model execution failed', 'Execution error should preserve runtime error');
      },
      'Execution failure should reject',
    );
  } finally {
    await server.close();
  }
}

async function testIdempotencyLockManagerInMemoryFlow(): Promise<void> {
  const manager = new IdempotencyLockManager();

  const acquired = await manager.acquire('idem-1', 60);
  assert(acquired.acquired, 'First acquire should lock execution');
  assertEqual(acquired.record.state, 'locked', 'First acquire should create a locked record');

  const duplicate = await manager.acquire('idem-1', 60);
  assert(!duplicate.acquired, 'Duplicate acquire should not lock again');
  assertEqual(duplicate.record.state, 'locked', 'Duplicate acquire should return locked state');

  const successRecord = await manager.settleSuccess('idem-1', { output: 'cached' }, 60);
  assertEqual(successRecord.state, 'completed', 'settleSuccess should create completed record');

  const completed = await manager.acquire<{ output: string }>('idem-1', 60);
  assert(!completed.acquired, 'Acquire after success should not reacquire');
  assertEqual(completed.record.state, 'completed', 'Acquire after success should return completed state');
  assertDeepEqual(completed.record.result, { output: 'cached' }, 'Completed state should preserve cached result');

  await manager.settleFailure('idem-2', new Error('boom'), 60);
  const failed = await manager.acquire('idem-2', 60);
  assert(!failed.acquired, 'Acquire after failure should not reacquire while failure TTL is active');
  assertEqual(failed.record.state, 'failed', 'Acquire after failure should return failed state');
  assert(
    typeof failed.record.error === 'object' && failed.record.error !== null,
    'Failed state should preserve serialized error object',
  );

  await manager.release('idem-3');
  const releasedAcquire = await manager.acquire('idem-3', 60);
  assert(releasedAcquire.acquired, 'Acquire after release on missing key should still work');
}

async function testWorkerSuccessFlow(): Promise<void> {
  const payload = createTestPayload({
    jobId: 'job-success',
    idempotencyKey: 'idem-success',
  });

  const rpcClient = new MockRpcClient();
  rpcClient.response = {
    taskId: 'job-success',
    status: 'completed',
    result: { imageUrl: 'https://example.test/out.png' },
    error: null,
    executionTimeMs: 18,
  } as PythonMlRpcResponse;

  const idempotencyManager = new IdempotencyLockManager();

  const workerModule = await import('../src/worker');
  const worker = new workerModule.BullMqDispatcherWorker({
    config: defaultDispatcherConfig,
    rpcClient: rpcClient as unknown as PythonMlRpcClient,
    idempotencyManager,
    redis: null,
  });

  const job = new MockJob(payload);
  const result = await runWorkerProcessJob(worker, job);

  assertDeepEqual(result, { imageUrl: 'https://example.test/out.png' }, 'Worker should return RPC result payload');
  assertEqual(rpcClient.computeCalls.length, 1, 'Worker should execute one RPC call');

  const rpcRequest = rpcClient.computeCalls[0].request;
  assertEqual(rpcRequest.taskType, 'render_photobash', 'Worker should use explicit approved taskType');
  assertEqual(rpcRequest.taskId, 'job-success', 'Worker should map jobId to taskId');
  assertEqual(rpcRequest.idempotencyKey, 'idem-success', 'Worker should forward idempotencyKey');
  assertDeepEqual(rpcRequest.payload, payload, 'Worker should forward validated payload');
  assertDeepEqual(job.progressCalls, [5, 15, 30, 85, 100], 'Worker should report progress during success flow');

  const completed = await idempotencyManager.acquire<{ imageUrl: string }>('idem-success');
  assert(!completed.acquired, 'Completed result should be cached after success');
  assertEqual(completed.record.state, 'completed', 'Success flow should settle idempotency as completed');
  assertDeepEqual(
    completed.record.result,
    { imageUrl: 'https://example.test/out.png' },
    'Success flow should cache result',
  );
}

async function testWorkerCachedCompletedSkipsRpc(): Promise<void> {
  const payload = createTestPayload({
    jobId: 'job-cached',
    idempotencyKey: 'idem-cached',
  });

  const rpcClient = new MockRpcClient();
  rpcClient.response = {
    taskId: 'job-cached',
    status: 'completed',
    result: { shouldNotBeUsed: true },
    error: null,
    executionTimeMs: 1,
  } as PythonMlRpcResponse;

  const idempotencyManager = new IdempotencyLockManager();
  await idempotencyManager.settleSuccess('idem-cached', { imageUrl: 'cached.png' });

  const workerModule = await import('../src/worker');
  const worker = new workerModule.BullMqDispatcherWorker({
    config: defaultDispatcherConfig,
    rpcClient: rpcClient as unknown as PythonMlRpcClient,
    idempotencyManager,
    redis: null,
  });

  const job = new MockJob(payload);
  const result = await runWorkerProcessJob(worker, job);

  assertDeepEqual(result, { imageUrl: 'cached.png' }, 'Worker should return cached completed result');
  assertEqual(rpcClient.computeCalls.length, 0, 'Worker should skip RPC when completed result is cached');
  assertDeepEqual(job.progressCalls, [5, 15, 100], 'Worker should short-circuit progress for cached result');
}

async function testWorkerDuplicateActiveExecutionRejected(): Promise<void> {
  const payload = createTestPayload({
    jobId: 'job-locked',
    idempotencyKey: 'idem-locked',
  });

  const rpcClient = new MockRpcClient();
  rpcClient.response = {
    taskId: 'job-locked',
    status: 'completed',
    result: { ok: true },
    error: null,
    executionTimeMs: 1,
  } as PythonMlRpcResponse;

  const idempotencyManager = new IdempotencyLockManager();
  await idempotencyManager.acquire('idem-locked');

  const workerModule = await import('../src/worker');
  const worker = new workerModule.BullMqDispatcherWorker({
    config: defaultDispatcherConfig,
    rpcClient: rpcClient as unknown as PythonMlRpcClient,
    idempotencyManager,
    redis: null,
  });

  const job = new MockJob(payload);

  await assertRejects(
    () => runWorkerProcessJob(worker, job),
    (error) => {
      assert(error instanceof DuplicateActiveExecutionError, 'Worker should reject duplicate active execution');
    },
    'Worker should reject duplicate active execution',
  );

  assertEqual(rpcClient.computeCalls.length, 0, 'Duplicate active execution should not call RPC');
}

async function testWorkerFailureSettlesFailureAndRethrows(): Promise<void> {
  const payload = createTestPayload({
    jobId: 'job-failure',
    idempotencyKey: 'idem-failure',
  });

  const rpcClient = new MockRpcClient();
  const originalError = new Error('rpc failed');
  rpcClient.error = originalError;

  const idempotencyManager = new IdempotencyLockManager();

  const workerModule = await import('../src/worker');
  const worker = new workerModule.BullMqDispatcherWorker({
    config: defaultDispatcherConfig,
    rpcClient: rpcClient as unknown as PythonMlRpcClient,
    idempotencyManager,
    redis: null,
  });

  const job = new MockJob(payload);

  await assertRejects(
    () => runWorkerProcessJob(worker, job),
    (error) => {
      assertEqual(error, originalError, 'Worker should rethrow the original RPC error');
    },
    'Worker should rethrow original RPC error',
  );

  const failed = await idempotencyManager.acquire('idem-failure');
  assert(!failed.acquired, 'Failure should be settled into idempotency store');
  assertEqual(failed.record.state, 'failed', 'Failure should settle failed state');
}

async function testWorkerValidationFailure(): Promise<void> {
  const rpcClient = new MockRpcClient();
  rpcClient.response = {
    taskId: 'unused',
    status: 'completed',
    result: { ok: true },
    error: null,
    executionTimeMs: 1,
  } as PythonMlRpcResponse;

  const workerModule = await import('../src/worker');
  const worker = new workerModule.BullMqDispatcherWorker({
    config: defaultDispatcherConfig,
    rpcClient: rpcClient as unknown as PythonMlRpcClient,
    idempotencyManager: new IdempotencyLockManager(),
    redis: null,
  });

  const invalidJob = new MockJob({ invalid: true } as unknown as GenerationJobPayload);

  await assertRejects(
    () => runWorkerProcessJob(worker, invalidJob),
    (error) => {
      assert(error instanceof Error, 'Validation failure should throw');
    },
    'Worker should validate incoming payload',
  );

  assertEqual(rpcClient.computeCalls.length, 0, 'Validation failure should prevent RPC execution');
}

async function testQueueValidationAndDeterministicJobId(): Promise<void> {
  const payload = createTestPayload({
    jobId: 'job-queue',
    idempotencyKey: 'idem-queue',
  });

  const mockQueue = new MockQueue<GenerationJobPayload>();

  const queue = new DispatcherGenerationQueue({
    config: defaultDispatcherConfig,
    queue: mockQueue as unknown as import('bullmq').Queue<GenerationJobPayload, unknown, string>,
  });

  const result = await queue.enqueue(payload);

  assertEqual(mockQueue.addCalls.length, 1, 'Queue should enqueue exactly once');
  assertEqual(mockQueue.addCalls[0].name, defaultDispatcherConfig.queueName, 'Queue should use configured queue name');
  assertDeepEqual(mockQueue.addCalls[0].data, payload, 'Queue should enqueue validated payload');
  assertEqual(
    mockQueue.addCalls[0].options?.jobId as string,
    payload.idempotencyKey,
    'Queue should use idempotencyKey as deterministic jobId',
  );
  assertEqual(result.id as string, payload.idempotencyKey, 'Enqueue result should reflect deterministic jobId');

  await assertRejects(
    () => queue.enqueue({ invalid: true } as unknown as GenerationJobPayload),
    () => {},
    'Queue should reject invalid payload',
  );
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function run(): Promise<void> {
  await testPythonMlRpcClientSuccess();
  await testPythonMlRpcClientTimeout();
  await testPythonMlRpcClientExecutionError();
  await testIdempotencyLockManagerInMemoryFlow();
  await testWorkerSuccessFlow();
  await testWorkerCachedCompletedSkipsRpc();
  await testWorkerDuplicateActiveExecutionRejected();
  await testWorkerFailureSettlesFailureAndRethrows();
  await testWorkerValidationFailure();
  await testQueueValidationAndDeterministicJobId();
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
