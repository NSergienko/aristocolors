import http from 'node:http';
import { once } from 'node:events';
import express from 'express';

import { InMemoryRedisLike } from '../src/sse/redis-like';
import { GenerationStreamReplayBuffer } from '../src/sse/replay-buffer';
import { SSEBroadcaster } from '../src/sse/broadcaster';
import { createGenerationStreamHandler } from '../src/sse/handler';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected=${String(expected)} Actual=${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Assertion failed: ${message}. Expected=${expectedJson} Actual=${actualJson}`);
  }
}

type StreamEvent = {
  id: number;
  event: string;
  data: unknown;
};

class SseTestClient {
  private readonly baseUrl: string;
  private request: http.ClientRequest | null = null;
  private response: http.IncomingMessage | null = null;
  private buffer = '';
  private events: StreamEvent[] = [];
  private comments: string[] = [];
  private connected = false;
  private closed = false;
  private statusCode = 0;
  private headers: http.IncomingHttpHeaders = {};
  private resolveConnect: (() => void) | null = null;
  private rejectConnect: ((error: unknown) => void) | null = null;
  private connectPromise: Promise<void> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async connect(pathname: string, headers?: Record<string, string>): Promise<void> {
    if (this.connectPromise) {
      throw new Error('Client already connected/connecting');
    }

    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.resolveConnect = resolve;
      this.rejectConnect = reject;

      const request = http.request(
        `${this.baseUrl}${pathname}`,
        {
          method: 'GET',
          headers,
        },
        (response) => {
          this.response = response;
          this.statusCode = response.statusCode ?? 0;
          this.headers = response.headers;
          this.connected = true;
          if (this.resolveConnect) {
            this.resolveConnect();
          }

          response.setEncoding('utf8');
          response.on('data', (chunk: string) => {
            this.buffer += chunk;
            this.consumeBuffer();
          });

          response.on('end', () => {
            this.closed = true;
          });

          response.on('close', () => {
            this.closed = true;
          });

          response.on('error', (error) => {
            this.closed = true;
            if (!this.connected && this.rejectConnect) {
              this.rejectConnect(error);
            }
          });
        },
      );

      this.request = request;

      request.on('error', (error) => {
        this.closed = true;
        if (!this.connected && this.rejectConnect) {
          this.rejectConnect(error);
        }
      });

      request.end();
    });

    await this.connectPromise;
  }

  getStatusCode(): number {
    return this.statusCode;
  }

  getHeaders(): http.IncomingHttpHeaders {
    return this.headers;
  }

  getEvents(): StreamEvent[] {
    return [...this.events];
  }

  getComments(): string[] {
    return [...this.comments];
  }

  async waitForEventCount(expectedCount: number, timeoutMs = 1000): Promise<StreamEvent[]> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      if (this.events.length >= expectedCount) {
        return this.getEvents();
      }
      await delay(10);
    }

    throw new Error(`Timed out waiting for ${expectedCount} events; got ${this.events.length}`);
  }

  async waitForCommentContaining(expectedSubstring: string, timeoutMs = 1000): Promise<string[]> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      if (this.comments.some((comment) => comment.includes(expectedSubstring))) {
        return this.getComments();
      }
      await delay(10);
    }

    throw new Error(`Timed out waiting for comment containing "${expectedSubstring}"`);
  }

  async waitForClose(timeoutMs = 1000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      if (this.closed) {
        return;
      }
      await delay(10);
    }

    throw new Error('Timed out waiting for connection close');
  }

  async close(): Promise<void> {
    if (this.request) {
      this.request.destroy();
    }
    if (this.response) {
      this.response.destroy();
    }
    this.closed = true;
    await delay(10);
  }

  private consumeBuffer(): void {
    while (true) {
      const delimiterIndex = this.buffer.indexOf('\n\n');
      if (delimiterIndex < 0) {
        return;
      }

      const rawBlock = this.buffer.slice(0, delimiterIndex);
      this.buffer = this.buffer.slice(delimiterIndex + 2);

      if (!rawBlock.trim()) {
        continue;
      }

      this.parseBlock(rawBlock);
    }
  }

  private parseBlock(rawBlock: string): void {
    const lines = rawBlock.split('\n');
    let id: number | null = null;
    let event: string | null = null;
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith(':')) {
        this.comments.push(line);
        continue;
      }

      if (line.startsWith('id:')) {
        id = Number(line.slice(3).trim());
        continue;
      }

      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
        continue;
      }

      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (id !== null && event) {
      const dataText = dataLines.join('\n');
      this.events.push({
        id,
        event,
        data: JSON.parse(dataText),
      });
    }
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function createTestServer(options?: {
  heartbeatIntervalMs?: number;
}): Promise<{
  baseUrl: string;
  redis: InMemoryRedisLike;
  replayBuffer: GenerationStreamReplayBuffer;
  broadcaster: SSEBroadcaster;
  close: () => Promise<void>;
}> {
  const redis = new InMemoryRedisLike();
  const replayBuffer = new GenerationStreamReplayBuffer({
    redis,
    keyPrefix: 'test:sse',
    ttlSeconds: 60,
  });
  const broadcaster = new SSEBroadcaster({
    redis,
    replayBuffer,
    channelPrefix: 'test:sse:channel',
  });

  const app = express();
  app.get(
    '/api/v1/generations/:id/stream',
    createGenerationStreamHandler({
      broadcaster,
      replayBuffer,
      heartbeatIntervalMs: options?.heartbeatIntervalMs ?? 50,
    }),
  );

  const server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to get server address');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    redis,
    replayBuffer,
    broadcaster,
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

function makeStartedEventInput(generationId: string, jobId = 'job-1') {
  return {
    type: 'started' as const,
    generationId,
    createdAt: new Date().toISOString(),
    payload: {
      jobId,
      targetProvider: 'flux_1_dev' as const,
      resolution: '1024x1024' as const,
      seed: 123,
      status: 'started',
    },
  };
}

function makeProgressEventInput(generationId: string, jobId = 'job-1', progress = 0.5) {
  return {
    type: 'progress' as const,
    generationId,
    createdAt: new Date().toISOString(),
    payload: {
      jobId,
      status: 'progress',
      progress,
    },
  };
}

function makeCompletedEventInput(generationId: string, jobId = 'job-1') {
  return {
    type: 'completed' as const,
    generationId,
    createdAt: new Date().toISOString(),
    payload: {
      jobId,
      status: 'completed',
      targetProvider: 'flux_1_dev' as const,
      resolution: '1024x1024' as const,
      seed: 123,
    },
  };
}

function makeFailedEventInput(generationId: string, jobId = 'job-1', error = 'boom') {
  return {
    type: 'failed' as const,
    generationId,
    createdAt: new Date().toISOString(),
    payload: {
      jobId,
      status: 'failed',
      error,
    },
  };
}

async function testReplayBufferAllocatesMonotonicSeqAndStoresOrderedReplay(): Promise<void> {
  const redis = new InMemoryRedisLike();
  const replayBuffer = new GenerationStreamReplayBuffer({
    redis,
    keyPrefix: 'test:replay',
    ttlSeconds: 60,
  });

  const generationId = '11111111-1111-1111-1111-111111111111';

  const started = await replayBuffer.append(makeStartedEventInput(generationId));
  const progress = await replayBuffer.append(makeProgressEventInput(generationId, 'job-1', 0.25));
  const completed = await replayBuffer.append(makeCompletedEventInput(generationId));

  assertEqual(started.seq, 1, 'started seq should be 1');
  assertEqual(progress.seq, 2, 'progress seq should be 2');
  assertEqual(completed.seq, 3, 'completed seq should be 3');

  const replayed = await replayBuffer.listAfter(generationId, 0);
  assertEqual(replayed.length, 3, 'replay should return all events');
  assertDeepEqual(
    replayed.map((event) => event.seq),
    [1, 2, 3],
    'replay should be returned in ascending seq order',
  );
}

async function testReplayReturnsOnlyEventsAfterLastEventId(): Promise<void> {
  const redis = new InMemoryRedisLike();
  const replayBuffer = new GenerationStreamReplayBuffer({
    redis,
    keyPrefix: 'test:replay:last-event-id',
    ttlSeconds: 60,
  });

  const generationId = '22222222-2222-2222-2222-222222222222';

  await replayBuffer.append(makeStartedEventInput(generationId));
  await replayBuffer.append(makeProgressEventInput(generationId, 'job-2', 0.2));
  await replayBuffer.append(makeProgressEventInput(generationId, 'job-2', 0.8));
  await replayBuffer.append(makeCompletedEventInput(generationId, 'job-2'));

  const replayed = await replayBuffer.listAfter(generationId, 2);

  assertDeepEqual(
    replayed.map((event) => event.seq),
    [3, 4],
    'replay should return only events with seq > Last-Event-ID',
  );
}

async function testSseEndpointHeadersAreCorrect(): Promise<void> {
  const server = await createTestServer();

  try {
    const client = new SseTestClient(server.baseUrl);
    await client.connect('/api/v1/generations/33333333-3333-3333-3333-333333333333/stream');

    assertEqual(client.getStatusCode(), 200, 'SSE endpoint should return 200');

    const headers = client.getHeaders();
    assert(
      String(headers['content-type'] ?? '').includes('text/event-stream'),
      'Content-Type should be text/event-stream',
    );
    assertEqual(
      String(headers['cache-control'] ?? ''),
      'no-cache, no-transform',
      'Cache-Control header should match',
    );
    assertEqual(
      String(headers['connection'] ?? ''),
      'keep-alive',
      'Connection header should match',
    );

    await client.close();
  } finally {
    await server.close();
  }
}

async function testLastEventIdReconnectReplaysMissedEvents(): Promise<void> {
  const server = await createTestServer();

  try {
    const generationId = '44444444-4444-4444-4444-444444444444';

    await server.broadcaster.publish(makeStartedEventInput(generationId, 'job-4'));
    await server.broadcaster.publish(makeProgressEventInput(generationId, 'job-4', 0.25));
    await server.broadcaster.publish(makeProgressEventInput(generationId, 'job-4', 0.75));
    await server.broadcaster.publish(makeCompletedEventInput(generationId, 'job-4'));

    const client = new SseTestClient(server.baseUrl);
    await client.connect(`/api/v1/generations/${generationId}/stream`, {
      'Last-Event-ID': '2',
    });

    const events = await client.waitForEventCount(2);

    assertDeepEqual(
      events.map((event) => event.id),
      [3, 4],
      'reconnect should replay only missed events after Last-Event-ID',
    );

    await client.waitForClose();
  } finally {
    await server.close();
  }
}

async function testLivePubSubDeliveryReachesMultipleConnectedClients(): Promise<void> {
  const server = await createTestServer();

  try {
    const generationId = '55555555-5555-5555-5555-555555555555';

    const clientA = new SseTestClient(server.baseUrl);
    const clientB = new SseTestClient(server.baseUrl);

    await clientA.connect(`/api/v1/generations/${generationId}/stream`);
    await clientB.connect(`/api/v1/generations/${generationId}/stream`);

    await server.broadcaster.publish(makeStartedEventInput(generationId, 'job-5'));
    await server.broadcaster.publish(makeProgressEventInput(generationId, 'job-5', 0.4));

    const eventsA = await clientA.waitForEventCount(2);
    const eventsB = await clientB.waitForEventCount(2);

    assertDeepEqual(
      eventsA.map((event) => event.id),
      [1, 2],
      'client A should receive live pub/sub events',
    );
    assertDeepEqual(
      eventsB.map((event) => event.id),
      [1, 2],
      'client B should receive live pub/sub events',
    );

    await clientA.close();
    await clientB.close();
  } finally {
    await server.close();
  }
}

async function testReplayToLiveTransitionSuppressesDuplicatesAndPreservesIncreasingSeq(): Promise<void> {
  const server = await createTestServer();

  try {
    const generationId = '66666666-6666-6666-6666-666666666666';

    await server.replayBuffer.append(makeStartedEventInput(generationId, 'job-6'));
    await server.replayBuffer.append(makeProgressEventInput(generationId, 'job-6', 0.2));

    const originalListAfter = server.replayBuffer.listAfter.bind(server.replayBuffer);
    let injected = false;

    server.replayBuffer.listAfter = async (requestedGenerationId: string, seq: number) => {
      const replayed = await originalListAfter(requestedGenerationId, seq);

      if (!injected && requestedGenerationId === generationId && seq === 0) {
        injected = true;
        await server.broadcaster.publish(makeProgressEventInput(generationId, 'job-6', 0.6));
        await server.broadcaster.publish(makeCompletedEventInput(generationId, 'job-6'));
      }

      return replayed;
    };

    const client = new SseTestClient(server.baseUrl);
    await client.connect(`/api/v1/generations/${generationId}/stream`);

    const events = await client.waitForEventCount(4);
    const seqs = events.map((event) => event.id);

    assertDeepEqual(
      seqs,
      [1, 2, 3, 4],
      'replay to live transition should preserve strictly increasing seq',
    );

    const uniqueSeqs = new Set(seqs);
    assertEqual(uniqueSeqs.size, 4, 'replay to live transition should suppress duplicates');

    await client.waitForClose();
  } finally {
    await server.close();
  }
}

async function testHeartbeatEmitsPingComment(): Promise<void> {
  const server = await createTestServer({
    heartbeatIntervalMs: 20,
  });

  try {
    const client = new SseTestClient(server.baseUrl);
    await client.connect('/api/v1/generations/77777777-7777-7777-7777-777777777777/stream');

    const comments = await client.waitForCommentContaining(': ping', 500);
    assert(
      comments.some((comment) => comment === ': ping'),
      'heartbeat should emit : ping comment',
    );

    await client.close();
  } finally {
    await server.close();
  }
}

async function testDisconnectRemovesLocalListenerSubscriptionResources(): Promise<void> {
  const redis = new InMemoryRedisLike();
  const replayBuffer = new GenerationStreamReplayBuffer({
    redis,
    keyPrefix: 'test:disconnect',
    ttlSeconds: 60,
  });
  const broadcaster = new SSEBroadcaster({
    redis,
    replayBuffer,
    channelPrefix: 'test:disconnect:channel',
  });

  const generationId = '88888888-8888-8888-8888-888888888888';
  let deliveredCount = 0;

  const unsubscribe = await broadcaster.subscribe(generationId, async () => {
    deliveredCount += 1;
  });

  await broadcaster.publish(makeStartedEventInput(generationId, 'job-8'));
  assertEqual(deliveredCount, 1, 'listener should receive event before unsubscribe');

  await unsubscribe();
  await broadcaster.publish(makeProgressEventInput(generationId, 'job-8', 0.3));

  assertEqual(deliveredCount, 1, 'listener should not receive events after unsubscribe');
}

async function testCompletedTerminalEventClosesTheStream(): Promise<void> {
  const server = await createTestServer();

  try {
    const generationId = '99999999-9999-9999-9999-999999999999';
    const client = new SseTestClient(server.baseUrl);

    await client.connect(`/api/v1/generations/${generationId}/stream`);

    await server.broadcaster.publish(makeStartedEventInput(generationId, 'job-9'));
    await server.broadcaster.publish(makeCompletedEventInput(generationId, 'job-9'));

    const events = await client.waitForEventCount(2);
    assertDeepEqual(
      events.map((event) => event.event),
      ['started', 'completed'],
      'completed terminal event should be delivered',
    );

    await client.waitForClose();
  } finally {
    await server.close();
  }
}

async function testFailedTerminalEventClosesTheStream(): Promise<void> {
  const server = await createTestServer();

  try {
    const generationId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const client = new SseTestClient(server.baseUrl);

    await client.connect(`/api/v1/generations/${generationId}/stream`);

    await server.broadcaster.publish(makeStartedEventInput(generationId, 'job-10'));
    await server.broadcaster.publish(makeFailedEventInput(generationId, 'job-10', 'rpc failed'));

    const events = await client.waitForEventCount(2);
    assertDeepEqual(
      events.map((event) => event.event),
      ['started', 'failed'],
      'failed terminal event should be delivered',
    );

    await client.waitForClose();
  } finally {
    await server.close();
  }
}

async function run(): Promise<void> {
  const tests: Array<{ name: string; fn: () => Promise<void> }> = [
    {
      name: 'replay buffer allocates monotonic seq and stores ordered replay',
      fn: testReplayBufferAllocatesMonotonicSeqAndStoresOrderedReplay,
    },
    {
      name: 'replay returns only events after Last-Event-ID',
      fn: testReplayReturnsOnlyEventsAfterLastEventId,
    },
    {
      name: 'SSE endpoint headers are correct',
      fn: testSseEndpointHeadersAreCorrect,
    },
    {
      name: 'Last-Event-ID reconnect replays missed events',
      fn: testLastEventIdReconnectReplaysMissedEvents,
    },
    {
      name: 'live Pub/Sub delivery reaches multiple connected clients',
      fn: testLivePubSubDeliveryReachesMultipleConnectedClients,
    },
    {
      name: 'replay to live transition suppresses duplicates and preserves increasing seq',
      fn: testReplayToLiveTransitionSuppressesDuplicatesAndPreservesIncreasingSeq,
    },
    {
      name: 'heartbeat emits ping comment',
      fn: testHeartbeatEmitsPingComment,
    },
    {
      name: 'disconnect removes local listener/subscription resources',
      fn: testDisconnectRemovesLocalListenerSubscriptionResources,
    },
    {
      name: 'completed terminal event closes the stream',
      fn: testCompletedTerminalEventClosesTheStream,
    },
    {
      name: 'failed terminal event closes the stream',
      fn: testFailedTerminalEventClosesTheStream,
    },
  ];

  for (const test of tests) {
    await test.fn();
    process.stdout.write(`ok - ${test.name}\n`);
  }
}

void run().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
