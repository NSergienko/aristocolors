import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  BlendRequestSchema,
  type BlendRequest,
  type GenerationJobPayload,
} from '@aristocolors/contracts';
import {
  createBlendGatewayApp,
  BlendGatewayService,
  DuplicateBlendExecutionError,
  InMemoryBlendGatewayRepository,
  IdempotencyLockManager,
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

class MockJobQueue {
  public enqueueCalls: GenerationJobPayload[] = [];

  async enqueue(payload: GenerationJobPayload): Promise<{ id: string }> {
    this.enqueueCalls.push(payload);
    return { id: payload.idempotencyKey };
  }
}

class SlowIdempotencyLockManager extends IdempotencyLockManager {
  private readonly releasePromise: Promise<void>;

  constructor(releasePromise: Promise<void>) {
    super();
    this.releasePromise = releasePromise;
  }

  override async settleSuccess<T = unknown>(idempotencyKey: string, result: T, ttlSeconds = 86400) {
    await this.releasePromise;
    return super.settleSuccess(idempotencyKey, result, ttlSeconds);
  }
}

function createValidBlendRequest(overrides: Partial<BlendRequest> = {}): BlendRequest {
  const request = {
    targetProvider: 'imagen_3',
    resolution: '1024x1024',
    harmonizationIntensity: 0.85,
    aristoColorsId: '11111111-1111-4111-8111-111111111111',
    manifestSnapshot: {
      version: 3,
      width: 1024,
      height: 1024,
      layers: [
        {
          id: 'layer-1',
          name: 'base',
          kind: 'image',
          sourceAssetId: 'asset-1',
          opacity: 1,
          visible: true,
          blendMode: 'normal',
          x: 0,
          y: 0,
          width: 1024,
          height: 1024,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
      ],
    },
    options: {
      test: true,
    },
    ...overrides,
  };

  return BlendRequestSchema.parse(request);
}

function createGatewayTestContext() {
  const repository = new InMemoryBlendGatewayRepository();
  repository.setProfileVersion('11111111-1111-4111-8111-111111111111', 'profile-v7');
  repository.setSourceAssetChecksum('asset-1', 'a'.repeat(64));

  const queue = new MockJobQueue();
  const idempotencyManager = new IdempotencyLockManager();
  const service = new BlendGatewayService({
    compilerVersion: 'compiler-2.1.0',
    repository,
    idempotencyManager,
    jobQueue: queue as unknown as never,
  });
  const app = createBlendGatewayApp({ service });

  return {
    repository,
    queue,
    idempotencyManager,
    service,
    app,
  };
}

async function startApp(app: ReturnType<typeof createBlendGatewayApp>) {
  const server = createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    async close(): Promise<void> {
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

async function postJson(
  baseUrl: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });

  const json = (await response.json()) as unknown;

  return {
    status: response.status,
    json,
  };
}

async function testMissingIdempotencyKeyReturns400(): Promise<void> {
  const context = createGatewayTestContext();
  const server = await startApp(context.app);

  try {
    const response = await postJson(
      server.baseUrl,
      '/api/v1/projects/22222222-2222-4222-8222-222222222222/blend',
      createValidBlendRequest(),
      {
        'x-user-id': '33333333-3333-4333-8333-333333333333',
      },
    );

    assertEqual(response.status, 400, 'Missing Idempotency-Key should return HTTP 400');
  } finally {
    await server.close();
  }
}

async function testInvalidBlendRequestReturns400(): Promise<void> {
  const context = createGatewayTestContext();
  const server = await startApp(context.app);

  try {
    const response = await postJson(
      server.baseUrl,
      '/api/v1/projects/22222222-2222-4222-8222-222222222222/blend',
      { invalid: true },
      {
        'x-user-id': '33333333-3333-4333-8333-333333333333',
        'Idempotency-Key': '44444444-4444-4444-8444-444444444444',
      },
    );

    assertEqual(response.status, 400, 'Invalid BlendRequest should return HTTP 400');
  } finally {
    await server.close();
  }
}

async function testMissingAuthenticatedUserRejected(): Promise<void> {
  const context = createGatewayTestContext();
  const server = await startApp(context.app);

  try {
    const response = await postJson(
      server.baseUrl,
      '/api/v1/projects/22222222-2222-4222-8222-222222222222/blend',
      createValidBlendRequest(),
      {
        'Idempotency-Key': '44444444-4444-4444-8444-444444444444',
      },
    );

    assertEqual(response.status, 400, 'Missing authenticated userId should return HTTP 400');
  } finally {
    await server.close();
  }
}

async function testValidNewRequestReturns202AndIsExistingFalse(): Promise<void> {
  const context = createGatewayTestContext();
  const server = await startApp(context.app);

  try {
    const idempotencyKey = '44444444-4444-4444-8444-444444444444';
    const response = await postJson(
      server.baseUrl,
      '/api/v1/projects/22222222-2222-4222-8222-222222222222/blend',
      createValidBlendRequest(),
      {
        'x-user-id': '33333333-3333-4333-8333-333333333333',
        'Idempotency-Key': idempotencyKey,
      },
    );

    assertEqual(response.status, 202, 'New valid request should return HTTP 202');

    const body = response.json as Record<string, unknown>;
    assertEqual(body.isExisting, false, 'New valid request should return isExisting false');
    assertEqual(body.idempotencyKey, idempotencyKey, 'Response should preserve idempotencyKey');
    assertEqual(context.queue.enqueueCalls.length, 1, 'New request should dispatch exactly once');
  } finally {
    await server.close();
  }
}

async function testRepeatedIdempotencyKeyReturns200SameGenerationIdAndNoSecondDispatch(): Promise<void> {
  const context = createGatewayTestContext();
  const server = await startApp(context.app);

  try {
    const path = '/api/v1/projects/22222222-2222-4222-8222-222222222222/blend';
    const headers = {
      'x-user-id': '33333333-3333-4333-8333-333333333333',
      'Idempotency-Key': '44444444-4444-4444-8444-444444444444',
    };
    const request = createValidBlendRequest();

    const first = await postJson(server.baseUrl, path, request, headers);
    const second = await postJson(server.baseUrl, path, request, headers);

    assertEqual(first.status, 202, 'First request should be accepted');
    assertEqual(second.status, 200, 'Repeated request should return existing result');

    const firstBody = first.json as Record<string, unknown>;
    const secondBody = second.json as Record<string, unknown>;

    assertEqual(secondBody.isExisting, true, 'Repeated request should set isExisting true');
    assertEqual(
      secondBody.generationId,
      firstBody.generationId,
      'Repeated request should return the same generationId',
    );
    assertEqual(context.queue.enqueueCalls.length, 1, 'Repeated request should not enqueue a second job');
  } finally {
    await server.close();
  }
}

async function testDuplicateActiveExecutionReturns409(): Promise<void> {
  let releaseSettle!: () => void;
  const releasePromise = new Promise<void>((resolve) => {
    releaseSettle = resolve;
  });

  const repository = new InMemoryBlendGatewayRepository();
  repository.setProfileVersion('11111111-1111-4111-8111-111111111111', 'profile-v7');
  repository.setSourceAssetChecksum('asset-1', 'a'.repeat(64));

  const queue = new MockJobQueue();
  const service = new BlendGatewayService({
    compilerVersion: 'compiler-2.1.0',
    repository,
    idempotencyManager: new SlowIdempotencyLockManager(releasePromise),
    jobQueue: queue as unknown as never,
  });
  const app = createBlendGatewayApp({ service });
  const server = await startApp(app);

  try {
    const path = '/api/v1/projects/22222222-2222-4222-8222-222222222222/blend';
    const headers = {
      'x-user-id': '33333333-3333-4333-8333-333333333333',
      'Idempotency-Key': '44444444-4444-4444-8444-444444444444',
    };
    const request = createValidBlendRequest();

    const firstPromise = postJson(server.baseUrl, path, request, headers);
    await waitFor(() => queue.enqueueCalls.length === 1);

    const second = await postJson(server.baseUrl, path, request, headers);
    assertEqual(second.status, 409, 'Duplicate active execution should return HTTP 409');

    releaseSettle();
    const first = await firstPromise;
    assertEqual(first.status, 202, 'Original request should still succeed');
    assertEqual(queue.enqueueCalls.length, 1, 'Duplicate active request should not enqueue again');
  } finally {
    await server.close();
  }
}

async function testServiceUsesRealAristoColorsIdManifestAndGeneratedSeed(): Promise<void> {
  const context = createGatewayTestContext();
  const request = createValidBlendRequest({
    aristoColorsId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    manifestSnapshot: {
      version: 9,
      width: 2048,
      height: 2048,
      layers: [
        {
          id: 'layer-custom',
          name: 'foreground',
          kind: 'image',
          sourceAssetId: 'asset-custom',
          opacity: 0.9,
          visible: true,
          blendMode: 'multiply',
          x: 20,
          y: 40,
          width: 512,
          height: 512,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
      ],
    },
  });

  context.repository.setProfileVersion('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'profile-v9');
  context.repository.setSourceAssetChecksum('asset-custom', 'b'.repeat(64));

  const response = await context.service.createBlendGeneration({
    projectId: '22222222-2222-4222-8222-222222222222',
    userId: '33333333-3333-4333-8333-333333333333',
    idempotencyKey: '55555555-5555-4555-8555-555555555555',
    request,
  });

  assertEqual(response.isExisting, false, 'New service request should not be existing');
  assertEqual(context.queue.enqueueCalls.length, 1, 'Service should enqueue exactly one job');

  const job = context.queue.enqueueCalls[0];
  assertEqual(job.aristoColorsId, request.aristoColorsId, 'Service should use the real aristoColorsId');
  assertDeepEqual(job.manifestSnapshot, request.manifestSnapshot, 'Service should use the real manifestSnapshot');
  assert(typeof job.seed === 'number', 'Service should generate a seed when omitted');
  assertEqual(job.provenance.seed, job.seed, 'Generated seed should match provenance seed exactly');
  assertEqual(job.provenance.manifestVersion, request.manifestSnapshot.version, 'Provenance should use manifest version');
  assertEqual(job.provenance.compilerVersion, 'compiler-2.1.0', 'Provenance should use injected compilerVersion');
  assertEqual(job.provenance.profileVersion, 'profile-v9', 'Provenance should use repository profileVersion');
  assertDeepEqual(
    job.provenance.sourceAssetChecksums,
    { 'asset-custom': 'b'.repeat(64) },
    'Provenance should use repository source asset checksums',
  );
  assert(!('creditReservationId' in job), 'creditReservationId should be omitted');
}

async function testServiceUsesProvidedSeedExactly(): Promise<void> {
  const context = createGatewayTestContext();
  const request = createValidBlendRequest({
    seed: 123456789,
  });

  await context.service.createBlendGeneration({
    projectId: '22222222-2222-4222-8222-222222222222',
    userId: '33333333-3333-4333-8333-333333333333',
    idempotencyKey: '66666666-6666-4666-8666-666666666666',
    request,
  });

  const job = context.queue.enqueueCalls[0];
  assertEqual(job.seed, 123456789, 'Service should use provided seed exactly');
  assertEqual(job.provenance.seed, 123456789, 'Provided seed should be reused in provenance exactly');
}

async function testMissingProfileVersionFails(): Promise<void> {
  const repository = new InMemoryBlendGatewayRepository();
  repository.setSourceAssetChecksum('asset-1', 'a'.repeat(64));

  const queue = new MockJobQueue();
  const service = new BlendGatewayService({
    compilerVersion: 'compiler-2.1.0',
    repository,
    idempotencyManager: new IdempotencyLockManager(),
    jobQueue: queue as unknown as never,
  });

  await assertRejects(
    () =>
      service.createBlendGeneration({
        projectId: '22222222-2222-4222-8222-222222222222',
        userId: '33333333-3333-4333-8333-333333333333',
        idempotencyKey: '77777777-7777-4777-8777-777777777777',
        request: createValidBlendRequest(),
      }),
    (error) => {
      assert(error instanceof Error, 'Missing profile version should reject');
      assert(
        error instanceof Error && error.message.includes('Profile version not found'),
        'Missing profile version should fail explicitly',
      );
    },
    'Missing profile version should fail instead of fabricating provenance',
  );

  assertEqual(queue.enqueueCalls.length, 0, 'Missing profile version should prevent queue dispatch');
}

async function testMissingSourceAssetChecksumFails(): Promise<void> {
  const repository = new InMemoryBlendGatewayRepository();
  repository.setProfileVersion('11111111-1111-4111-8111-111111111111', 'profile-v7');

  const queue = new MockJobQueue();
  const service = new BlendGatewayService({
    compilerVersion: 'compiler-2.1.0',
    repository,
    idempotencyManager: new IdempotencyLockManager(),
    jobQueue: queue as unknown as never,
  });

  await assertRejects(
    () =>
      service.createBlendGeneration({
        projectId: '22222222-2222-4222-8222-222222222222',
        userId: '33333333-3333-4333-8333-333333333333',
        idempotencyKey: '88888888-8888-4888-8888-888888888888',
        request: createValidBlendRequest(),
      }),
    (error) => {
      assert(error instanceof Error, 'Missing source asset checksum should reject');
      assert(
        error instanceof Error && error.message.includes('Source asset checksum not found'),
        'Missing source asset checksum should fail explicitly',
      );
    },
    'Missing source asset checksum should fail instead of fabricating provenance',
  );

  assertEqual(queue.enqueueCalls.length, 0, 'Missing source asset checksum should prevent queue dispatch');
}

async function testDuplicateActiveExecutionViaService(): Promise<void> {
  const idempotencyManager = new IdempotencyLockManager();
  await idempotencyManager.acquire('99999999-9999-4999-8999-999999999999');

  const repository = new InMemoryBlendGatewayRepository();
  repository.setProfileVersion('11111111-1111-4111-8111-111111111111', 'profile-v7');
  repository.setSourceAssetChecksum('asset-1', 'a'.repeat(64));

  const service = new BlendGatewayService({
    compilerVersion: 'compiler-2.1.0',
    repository,
    idempotencyManager,
    jobQueue: new MockJobQueue() as unknown as never,
  });

  await assertRejects(
    () =>
      service.createBlendGeneration({
        projectId: '22222222-2222-4222-8222-222222222222',
        userId: '33333333-3333-4333-8333-333333333333',
        idempotencyKey: '99999999-9999-4999-8999-999999999999',
        request: createValidBlendRequest(),
      }),
    (error) => {
      assert(error instanceof DuplicateBlendExecutionError, 'Service should reject duplicate active execution');
    },
    'Duplicate active execution should be rejected',
  );
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function run(): Promise<void> {
  await testMissingIdempotencyKeyReturns400();
  await testInvalidBlendRequestReturns400();
  await testMissingAuthenticatedUserRejected();
  await testValidNewRequestReturns202AndIsExistingFalse();
  await testRepeatedIdempotencyKeyReturns200SameGenerationIdAndNoSecondDispatch();
  await testDuplicateActiveExecutionReturns409();
  await testServiceUsesRealAristoColorsIdManifestAndGeneratedSeed();
  await testServiceUsesProvidedSeedExactly();
  await testMissingProfileVersionFails();
  await testMissingSourceAssetChecksumFails();
  await testDuplicateActiveExecutionViaService();
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
