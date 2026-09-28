import assert from 'node:assert/strict';
import http from 'node:http';
import {
  FREE_TIER_ENTITLEMENTS,
  PRO_TIER_ENTITLEMENTS,
  STANDARD_TIER_ENTITLEMENTS,
  type BlendRequest,
  type GenerationJobPayload,
} from '@aristocolors/contracts';
import { createBlendGatewayApp } from '../src/gateway/app';
import {
  ConcurrencyLimitExceededError,
  ConcurrencySlotManager,
  ForbiddenCapabilityError,
  InMemoryConcurrencyKvStore,
  InMemorySubscriptionRepository,
  UnauthorizedError,
  resolveUserEntitlements,
  validateCapabilityGates,
} from '../src/gateway/entitlements';
import {
  BlendGatewayService,
  InMemoryBlendGatewayRepository,
} from '../src/gateway/service';
import { IdempotencyLockManager } from '../src/idempotency';
import { SSEBroadcaster } from '../src/sse/broadcaster';
import { GenerationStreamReplayBuffer } from '../src/sse/replay-buffer';
import type { RedisLike } from '../src/sse/redis-like';
import { BullMqDispatcherWorker } from '../src/worker';

async function main(): Promise<void> {
  await testEntitlementResolution();
  await testCapabilityGates();
  await testQueuedLimitEnforcementViaGateway();
  await testRunningLimitEnforcementViaWorker();
  await testHttp403ForForbiddenCapability();
  await testHttp429WithRetryAfterWhenThrottled();
  await testIdempotentReplayDoesNotConsumeAnotherQueuedSlot();
  await testWorkerTransitionFromQueuedToRunning();
  await testTerminalSuccessReleasesRunningSlot();
  await testTerminalFailureReleasesRunningSlot();
  await testSseDisconnectAndDeliveryDoNotControlSlotLifecycle();
}

async function testEntitlementResolution(): Promise<void> {
  const subscriptions = new InMemorySubscriptionRepository([
    {
      userId: 'user-standard',
      tier: 'standard',
      active: true,
    },
    {
      userId: 'user-pro',
      tier: 'pro',
      active: true,
    },
  ]);

  const freePolicy = await resolveUserEntitlements('user-free', subscriptions);
  assert.deepEqual(freePolicy, FREE_TIER_ENTITLEMENTS);

  const standardPolicy = await resolveUserEntitlements('user-standard', subscriptions);
  assert.deepEqual(standardPolicy, STANDARD_TIER_ENTITLEMENTS);

  const proPolicy = await resolveUserEntitlements('user-pro', subscriptions);
  assert.deepEqual(proPolicy, PRO_TIER_ENTITLEMENTS);

  await assert.rejects(
    () => resolveUserEntitlements('   ', subscriptions),
    (error: unknown) => error instanceof UnauthorizedError,
  );
}

async function testCapabilityGates(): Promise<void> {
  assert.throws(
    () =>
      validateCapabilityGates(FREE_TIER_ENTITLEMENTS, {
        resolution: '4096x4096',
      }),
    (error: unknown) =>
      error instanceof ForbiddenCapabilityError && error.capability === 'maxResolution',
  );

  assert.throws(
    () =>
      validateCapabilityGates(FREE_TIER_ENTITLEMENTS, {
        commercial4KUpscale: true,
      }),
    (error: unknown) =>
      error instanceof ForbiddenCapabilityError &&
      error.capability === 'allowCommercial4KUpscale',
  );

  assert.throws(
    () =>
      validateCapabilityGates(FREE_TIER_ENTITLEMENTS, {
        canvasLayerCount: FREE_TIER_ENTITLEMENTS.maxCanvasLayers + 1,
      }),
    (error: unknown) =>
      error instanceof ForbiddenCapabilityError && error.capability === 'maxCanvasLayers',
  );

  validateCapabilityGates(PRO_TIER_ENTITLEMENTS, {
    resolution: PRO_TIER_ENTITLEMENTS.maxResolution,
    commercial4KUpscale: true,
    canvasLayerCount: Math.min(PRO_TIER_ENTITLEMENTS.maxCanvasLayers, 4),
  });
}

async function testQueuedLimitEnforcementViaGateway(): Promise<void> {
  const subscriptions = new InMemorySubscriptionRepository([
    {
      userId: 'queued-user',
      tier: 'free',
      active: true,
    },
  ]);

  const concurrency = new ConcurrencySlotManager();
  const repository = createRepositoryWithFixtures();
  const idempotency = new IdempotencyLockManager();
  const queue = createRecordingQueue();
  const service = new BlendGatewayService({
    idempotencyManager: idempotency,
    compilerVersion: 'test-compiler',
    repository,
    subscriptionRepository: subscriptions,
    concurrencySlotManager: concurrency,
    jobQueue: queue,
  });

  const request = createBlendRequest({
    resolution: '1024x1024',
    commercial4KUpscale: false,
    layerCount: 2,
  });

  const first = await service.createBlendGeneration({
    projectId: 'project-1',
    idempotencyKey: 'queued-limit-1',
    userId: 'queued-user',
    request,
  });

  assert.equal(first.status, 'queued');
  assert.equal(await concurrency.getCount('queued-user', 'queued'), 1);

  await assert.rejects(
    () =>
      service.createBlendGeneration({
        projectId: 'project-1',
        idempotencyKey: 'queued-limit-2',
        userId: 'queued-user',
        request,
      }),
    (error: unknown) =>
      error instanceof ConcurrencyLimitExceededError &&
      error.scope === 'queued' &&
      error.limit === FREE_TIER_ENTITLEMENTS.maxQueuedJobs,
  );

  assert.equal(await concurrency.getCount('queued-user', 'queued'), 1);
}

async function testRunningLimitEnforcementViaWorker(): Promise<void> {
  const subscriptions = new InMemorySubscriptionRepository([
    {
      userId: 'running-user',
      tier: 'free',
      active: true,
    },
  ]);

  const concurrency = new ConcurrencySlotManager();
  await concurrency.acquire({
    userId: 'running-user',
    slotId: 'existing-running',
    limit: FREE_TIER_ENTITLEMENTS.maxRunningJobs,
    scope: 'running',
  });

  const worker = new BullMqDispatcherWorker({
    config: createWorkerConfig(),
    redis: null,
    broadcaster: undefined,
    rpcClient: new FakePythonMlRpcClient(async () => {
      return { result: { ok: true } };
    }) as never,
    idempotencyManager: new IdempotencyLockManager(),
    subscriptionRepository: subscriptions,
    concurrencySlotManager: concurrency,
  });

  const payload = createJobPayload({
    idempotencyKey: 'running-limit-job',
    jobId: 'running-limit-job',
    userId: 'running-user',
  });

  await assert.rejects(
    () => invokeWorkerProcessJob(worker, payload),
    (error: unknown) =>
      error instanceof ConcurrencyLimitExceededError &&
      error.scope === 'running' &&
      error.limit === FREE_TIER_ENTITLEMENTS.maxRunningJobs,
  );

  assert.equal(await concurrency.getCount('running-user', 'running'), 1);
}

async function testHttp403ForForbiddenCapability(): Promise<void> {
  const subscriptions = new InMemorySubscriptionRepository();
  const concurrency = new ConcurrencySlotManager();
  const repository = createRepositoryWithFixtures();
  const service = new BlendGatewayService({
    idempotencyManager: new IdempotencyLockManager(),
    compilerVersion: 'test-compiler',
    repository,
    subscriptionRepository: subscriptions,
    concurrencySlotManager: concurrency,
    jobQueue: createRecordingQueue(),
  });

  const app = createBlendGatewayApp({
    service,
    sse: {
      broadcaster: createBroadcaster(),
      replayBuffer: createReplayBuffer(),
    },
  });

  const server = await listen(app);

  try {
    const response = await httpRequestJson(server, {
      method: 'POST',
      path: '/api/v1/projects/project-403/blend',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'http-403-key',
        'x-user-id': 'http-user-free',
      },
      body: createBlendRequest({
        resolution: '4096x4096',
        commercial4KUpscale: false,
        layerCount: 2,
      }),
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await closeServer(server);
  }
}

async function testHttp429WithRetryAfterWhenThrottled(): Promise<void> {
  const subscriptions = new InMemorySubscriptionRepository([
    {
      userId: 'http-throttle-user',
      tier: 'free',
      active: true,
    },
  ]);
  const concurrency = new ConcurrencySlotManager();
  await concurrency.acquire({
    userId: 'http-throttle-user',
    slotId: 'occupied-queued-slot',
    limit: FREE_TIER_ENTITLEMENTS.maxQueuedJobs,
    scope: 'queued',
  });

  const repository = createRepositoryWithFixtures();
  const service = new BlendGatewayService({
    idempotencyManager: new IdempotencyLockManager(),
    compilerVersion: 'test-compiler',
    repository,
    subscriptionRepository: subscriptions,
    concurrencySlotManager: concurrency,
    jobQueue: createRecordingQueue(),
  });

  const app = createBlendGatewayApp({
    service,
    sse: {
      broadcaster: createBroadcaster(),
      replayBuffer: createReplayBuffer(),
    },
  });

  const server = await listen(app);

  try {
    const response = await httpRequestJson(server, {
      method: 'POST',
      path: '/api/v1/projects/project-429/blend',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'http-429-key',
        'x-user-id': 'http-throttle-user',
      },
      body: createBlendRequest({
        resolution: '1024x1024',
        commercial4KUpscale: false,
        layerCount: 2,
      }),
    });

    assert.equal(response.statusCode, 429);
    assert.equal(response.headers['retry-after'], '5');
  } finally {
    await closeServer(server);
  }
}

async function testIdempotentReplayDoesNotConsumeAnotherQueuedSlot(): Promise<void> {
  const subscriptions = new InMemorySubscriptionRepository([
    {
      userId: 'idempotent-user',
      tier: 'free',
      active: true,
    },
  ]);

  const concurrency = new ConcurrencySlotManager();
  const repository = createRepositoryWithFixtures();
  const idempotency = new IdempotencyLockManager();
  const queue = createRecordingQueue();

  const service = new BlendGatewayService({
    idempotencyManager: idempotency,
    compilerVersion: 'test-compiler',
    repository,
    subscriptionRepository: subscriptions,
    concurrencySlotManager: concurrency,
    jobQueue: queue,
  });

  const request = createBlendRequest({
    resolution: '1024x1024',
    commercial4KUpscale: false,
    layerCount: 2,
  });

  const first = await service.createBlendGeneration({
    projectId: 'project-idem',
    idempotencyKey: 'idem-key',
    userId: 'idempotent-user',
    request,
  });

  assert.equal(first.isExisting, false);
  assert.equal(queue.enqueued.length, 1);
  assert.equal(await concurrency.getCount('idempotent-user', 'queued'), 1);

  const second = await service.createBlendGeneration({
    projectId: 'project-idem',
    idempotencyKey: 'idem-key',
    userId: 'idempotent-user',
    request,
  });

  assert.equal(second.isExisting, true);
  assert.equal(queue.enqueued.length, 1);
  assert.equal(await concurrency.getCount('idempotent-user', 'queued'), 1);
}

async function testWorkerTransitionFromQueuedToRunning(): Promise<void> {
  const subscriptions = new InMemorySubscriptionRepository([
    {
      userId: 'transition-user',
      tier: 'free',
      active: true,
    },
  ]);

  const concurrency = new ConcurrencySlotManager();
  await concurrency.acquire({
    userId: 'transition-user',
    slotId: 'transition-job',
    limit: FREE_TIER_ENTITLEMENTS.maxQueuedJobs,
    scope: 'queued',
  });

  const rpcGate = createDeferred<void>();
  const rpcDone = createDeferred<void>();

  const worker = new BullMqDispatcherWorker({
    config: createWorkerConfig(),
    redis: null,
    broadcaster: undefined,
    rpcClient: new FakePythonMlRpcClient(async () => {
      rpcGate.resolve();
      await rpcDone.promise;
      return { result: { ok: true } };
    }) as never,
    idempotencyManager: new IdempotencyLockManager(),
    subscriptionRepository: subscriptions,
    concurrencySlotManager: concurrency,
  });

  const payload = createJobPayload({
    idempotencyKey: 'transition-key',
    jobId: 'transition-job',
    userId: 'transition-user',
  });

  const processing = invokeWorkerProcessJob(worker, payload);

  await rpcGate.promise;

  assert.equal(await concurrency.getCount('transition-user', 'queued'), 0);
  assert.equal(await concurrency.getCount('transition-user', 'running'), 1);

  rpcDone.resolve();
  await processing;

  assert.equal(await concurrency.getCount('transition-user', 'running'), 0);
}

async function testTerminalSuccessReleasesRunningSlot(): Promise<void> {
  const subscriptions = new InMemorySubscriptionRepository([
    {
      userId: 'success-user',
      tier: 'free',
      active: true,
    },
  ]);

  const concurrency = new ConcurrencySlotManager();
  const worker = new BullMqDispatcherWorker({
    config: createWorkerConfig(),
    redis: null,
    broadcaster: undefined,
    rpcClient: new FakePythonMlRpcClient(async () => {
      return { result: { ok: true } };
    }) as never,
    idempotencyManager: new IdempotencyLockManager(),
    subscriptionRepository: subscriptions,
    concurrencySlotManager: concurrency,
  });

  const payload = createJobPayload({
    idempotencyKey: 'success-key',
    jobId: 'success-job',
    userId: 'success-user',
  });

  await invokeWorkerProcessJob(worker, payload);

  assert.equal(await concurrency.getCount('success-user', 'running'), 0);
}

async function testTerminalFailureReleasesRunningSlot(): Promise<void> {
  const subscriptions = new InMemorySubscriptionRepository([
    {
      userId: 'failure-user',
      tier: 'free',
      active: true,
    },
  ]);

  const concurrency = new ConcurrencySlotManager();
  const worker = new BullMqDispatcherWorker({
    config: createWorkerConfig(),
    redis: null,
    broadcaster: undefined,
    rpcClient: new FakePythonMlRpcClient(async () => {
      throw new Error('python rpc failed');
    }) as never,
    idempotencyManager: new IdempotencyLockManager(),
    subscriptionRepository: subscriptions,
    concurrencySlotManager: concurrency,
  });

  const payload = createJobPayload({
    idempotencyKey: 'failure-key',
    jobId: 'failure-job',
    userId: 'failure-user',
  });

  await assert.rejects(() => invokeWorkerProcessJob(worker, payload));
  assert.equal(await concurrency.getCount('failure-user', 'running'), 0);
}

async function testSseDisconnectAndDeliveryDoNotControlSlotLifecycle(): Promise<void> {
  const store = new InMemoryRedisLike();
  const replayBuffer = createReplayBuffer(store);
  const broadcaster = createBroadcaster(store, replayBuffer);

  const concurrency = new ConcurrencySlotManager({
    store: new InMemoryConcurrencyKvStore(),
  });

  await concurrency.acquire({
    userId: 'sse-user',
    slotId: 'sse-job',
    limit: 3,
    scope: 'queued',
  });

  assert.equal(await concurrency.getCount('sse-user', 'queued'), 1);

  const received: string[] = [];
  const unsubscribe = await broadcaster.subscribe('generation-sse', async (event) => {
    received.push(event.type);
  });

  await broadcaster.publish({
    type: 'progress',
    generationId: 'generation-sse',
    createdAt: new Date().toISOString(),
    payload: {
      jobId: 'sse-job',
      status: 'progress',
      progress: 0.5,
    },
  });

  assert.deepEqual(received, ['progress']);
  assert.equal(await concurrency.getCount('sse-user', 'queued'), 1);

  await unsubscribe();

  assert.equal(await concurrency.getCount('sse-user', 'queued'), 1);
}

class RecordingDispatcherGenerationQueue {
  readonly enqueued: Array<{
    payload: GenerationJobPayload;
    options: { queuePriority?: number };
  }> = [];

  async enqueue(
    payload: GenerationJobPayload,
    options: { queuePriority?: number } = {},
  ): Promise<{ id: string }> {
    this.enqueued.push({
      payload,
      options,
    });

    return {
      id: payload.idempotencyKey,
    };
  }
}

class FakePythonMlRpcClient {
  private readonly handler: (request: unknown, timeoutMs: number) => Promise<{ result?: unknown }>;

  constructor(handler: (request: unknown, timeoutMs: number) => Promise<{ result?: unknown }>) {
    this.handler = handler;
  }

  async compute(request: unknown, timeoutMs: number): Promise<{ result?: unknown }> {
    return this.handler(request, timeoutMs);
  }
}

class InMemoryRedisLike implements RedisLike {
  private readonly values = new Map<string, string>();
  private readonly expires = new Map<string, number>();
  private readonly zsets = new Map<string, Map<string, number>>();
  private readonly subscriptions = new Map<string, Set<(message: string, channel: string) => void>>();

  async get(key: string): Promise<string | null> {
    this.cleanupKey(key);
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.values.set(key, value);
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      this.cleanupKey(key);
      const hadValue = this.values.delete(key);
      const hadZset = this.zsets.delete(key);
      this.expires.delete(key);
      if (hadValue || hadZset) {
        deleted += 1;
      }
    }
    return deleted;
  }

  async incr(key: string): Promise<number> {
    this.cleanupKey(key);
    const current = Number(this.values.get(key) ?? '0');
    const next = current + 1;
    this.values.set(key, String(next));
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (!this.values.has(key) && !this.zsets.has(key)) {
      return 0;
    }

    this.expires.set(key, Date.now() + seconds * 1000);
    return 1;
  }

  async ttl(key: string): Promise<number> {
    this.cleanupKey(key);

    if (!this.values.has(key) && !this.zsets.has(key)) {
      return -2;
    }

    const expiresAt = this.expires.get(key);
    if (!expiresAt) {
      return -1;
    }

    return Math.max(-2, Math.ceil((expiresAt - Date.now()) / 1000));
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    this.cleanupKey(key);
    const zset = this.zsets.get(key) ?? new Map<string, number>();
    const isNew = !zset.has(member);
    zset.set(member, score);
    this.zsets.set(key, zset);
    return isNew ? 1 : 0;
  }

  async zrangebyscore(key: string, min: number | string, max: number | string): Promise<string[]> {
    this.cleanupKey(key);
    const zset = this.zsets.get(key);
    if (!zset) {
      return [];
    }

    const minValue = normalizeScore(min, Number.NEGATIVE_INFINITY);
    const maxValue = normalizeScore(max, Number.POSITIVE_INFINITY);

    return Array.from(zset.entries())
      .filter(([, score]) => score >= minValue && score <= maxValue)
      .sort((a, b) => a[1] - b[1])
      .map(([member]) => member);
  }

  async publish(channel: string, message: string): Promise<number> {
    const listeners = this.subscriptions.get(channel);
    if (!listeners || listeners.size === 0) {
      return 0;
    }

    for (const listener of Array.from(listeners)) {
      listener(message, channel);
    }

    return listeners.size;
  }

  async subscribe(
    channel: string,
    handler: (message: string, channel: string) => void,
  ): Promise<() => Promise<void>> {
    const listeners = this.subscriptions.get(channel) ?? new Set();
    listeners.add(handler);
    this.subscriptions.set(channel, listeners);

    return async () => {
      const current = this.subscriptions.get(channel);
      if (!current) {
        return;
      }

      current.delete(handler);
      if (current.size === 0) {
        this.subscriptions.delete(channel);
      }
    };
  }

  private cleanupKey(key: string): void {
    const expiresAt = this.expires.get(key);
    if (expiresAt !== undefined && expiresAt <= Date.now()) {
      this.expires.delete(key);
      this.values.delete(key);
      this.zsets.delete(key);
    }
  }
}

function createRepositoryWithFixtures(): InMemoryBlendGatewayRepository {
  const repository = new InMemoryBlendGatewayRepository();
  repository.setProfileVersion('profile-1', 'v1');
  repository.setSourceAssetChecksum('asset-1', 'checksum-asset-1');
  repository.setSourceAssetChecksum('asset-2', 'checksum-asset-2');
  repository.setSourceAssetChecksum('asset-3', 'checksum-asset-3');
  return repository;
}

function createRecordingQueue(): RecordingDispatcherGenerationQueue {
  return new RecordingDispatcherGenerationQueue();
}

function createReplayBuffer(redis: RedisLike = new InMemoryRedisLike()): GenerationStreamReplayBuffer {
  return new GenerationStreamReplayBuffer({
    redis,
  });
}

function createBroadcaster(
  redis: RedisLike = new InMemoryRedisLike(),
  replayBuffer = createReplayBuffer(redis),
): SSEBroadcaster {
  return new SSEBroadcaster({
    redis,
    replayBuffer,
  });
}

function createBlendRequest(input: {
  resolution: string;
  commercial4KUpscale: boolean;
  layerCount: number;
}): BlendRequest {
  return {
    aristoColorsId: 'profile-1',
    targetProvider: 'openai',
    resolution: input.resolution as BlendRequest['resolution'],
    harmonizationIntensity: 0.5,
    commercial4KUpscale: input.commercial4KUpscale,
    manifestSnapshot: {
      version: '1',
      width: 1024,
      height: 1024,
      layers: Array.from({ length: input.layerCount }, (_, index) => ({
        id: `layer-${index + 1}`,
        sourceAssetId: index % 2 === 0 ? 'asset-1' : 'asset-2',
        blendMode: 'normal',
        opacity: 1,
        visible: true,
        x: 0,
        y: 0,
        width: 512,
        height: 512,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      })),
    },
  } as BlendRequest;
}

function createJobPayload(input: {
  idempotencyKey: string;
  jobId: string;
  userId: string;
}): GenerationJobPayload {
  const createdAt = new Date().toISOString();

  return {
    idempotencyKey: input.idempotencyKey,
    jobId: input.jobId,
    projectId: 'project-worker',
    userId: input.userId,
    aristoColorsId: 'generation-worker',
    targetProvider: 'openai',
    resolution: '1024x1024',
    harmonizationIntensity: 0.5,
    seed: 123,
    priority: 1,
    manifestSnapshot: {
      version: '1',
      width: 1024,
      height: 1024,
      layers: [
        {
          id: 'layer-1',
          sourceAssetId: 'asset-1',
          blendMode: 'normal',
          opacity: 1,
          visible: true,
          x: 0,
          y: 0,
          width: 512,
          height: 512,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
      ],
    },
    provenance: {
      manifestVersion: '1',
      manifestChecksumSha256: 'checksum-manifest',
      compilerVersion: 'test-compiler',
      profileVersion: 'v1',
      sourceAssetChecksums: {
        'asset-1': 'checksum-asset-1',
      },
      seed: 123,
      targetProvider: 'openai',
      resolution: '1024x1024',
      createdAt,
    },
  };
}

function createWorkerConfig() {
  return {
    redisHost: '127.0.0.1',
    redisPort: 6379,
    queueName: 'dispatcher-test-queue',
    rpcTimeoutMs: 1000,
  };
}

async function invokeWorkerProcessJob(
  worker: BullMqDispatcherWorker,
  payload: GenerationJobPayload,
): Promise<unknown> {
  const job = {
    data: payload,
    updateProgress: async () => undefined,
  };

  const processJob = (
    worker as unknown as {
      processJob: (job: unknown) => Promise<unknown>;
    }
  ).processJob;

  return processJob.call(worker, job);
}

async function listen(app: Parameters<typeof http.createServer>[0]): Promise<http.Server> {
  const server = http.createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve());
    server.once('error', reject);
  });

  return server;
}

async function closeServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function httpRequestJson(
  server: http.Server,
  input: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: unknown;
  },
): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  bodyText: string;
}> {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Server is not listening on a TCP port');
  }

  const bodyText = input.body === undefined ? '' : JSON.stringify(input.body);

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port: address.port,
        method: input.method,
        path: input.path,
        headers: {
          ...(input.headers ?? {}),
          'content-length': Buffer.byteLength(bodyText).toString(),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        response.on('end', () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            bodyText: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );

    request.on('error', reject);

    if (bodyText) {
      request.write(bodyText);
    }

    request.end();
  });
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

function normalizeScore(value: number | string, fallback: number): number {
  if (typeof value === 'number') {
    return value;
  }

  if (value === '-inf') {
    return Number.NEGATIVE_INFINITY;
  }

  if (value === '+inf' || value === 'inf') {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

void main();
