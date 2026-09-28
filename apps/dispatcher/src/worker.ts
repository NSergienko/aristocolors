import { Worker, type Job, type WorkerOptions } from 'bullmq';
import IORedis from 'ioredis';
import {
  GenerationJobPayloadSchema,
  type GenerationJobPayload,
  type GenerationJobPayload as GenerationJobResult,
  type PythonMlRpcRequest,
} from '@aristocolors/contracts';
import type Redis from 'ioredis';
import type { DispatcherConfig } from './config';
import { IdempotencyLockManager, type IdempotencyRecord } from './idempotency';
import { PythonMlRpcClient } from './rpc-client';

export interface BullMqDispatcherWorkerOptions {
  config: DispatcherConfig;
  rpcClient?: PythonMlRpcClient;
  idempotencyManager?: IdempotencyLockManager;
  redis?: Redis | null;
}

export class DuplicateActiveExecutionError extends Error {
  public readonly name = 'DuplicateActiveExecutionError';
  public readonly idempotencyKey: string;
  public readonly record: IdempotencyRecord<unknown>;

  constructor(idempotencyKey: string, record: IdempotencyRecord<unknown>) {
    super(`Duplicate active execution for idempotency key ${idempotencyKey}`);
    this.idempotencyKey = idempotencyKey;
    this.record = record;
  }
}

export class BullMqDispatcherWorker {
  private readonly config: DispatcherConfig;
  private readonly rpcClient: PythonMlRpcClient;
  private readonly idempotencyManager: IdempotencyLockManager;
  private readonly redis: Redis;
  private readonly ownsRedis: boolean;
  private worker: Worker<GenerationJobPayload, unknown, string> | null = null;

  constructor(options: BullMqDispatcherWorkerOptions) {
    this.config = options.config;
    this.redis =
      options.redis ??
      new IORedis({
        host: this.config.redisHost,
        port: this.config.redisPort,
        lazyConnect: true,
        maxRetriesPerRequest: null,
      });
    this.ownsRedis = !options.redis;

    this.rpcClient = options.rpcClient ?? PythonMlRpcClient.fromConfig(this.config);
    this.idempotencyManager =
      options.idempotencyManager ??
      new IdempotencyLockManager({
        redis: this.redis,
      });
  }

  async start(concurrency = 3): Promise<void> {
    if (this.worker) {
      return;
    }

    if (this.ownsRedis && this.redis.status === 'wait') {
      await this.redis.connect();
    }

    const workerOptions: WorkerOptions = {
      connection: this.redis,
      concurrency,
    };

    this.worker = new Worker<GenerationJobPayload, unknown, string>(
      this.config.queueName,
      async (job) => this.processJob(job),
      workerOptions,
    );
  }

  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }

    if (this.ownsRedis && this.redis.status !== 'end') {
      await this.redis.quit();
    }
  }

  private async processJob(job: Job<GenerationJobPayload, unknown, string>): Promise<unknown> {
    await this.reportProgress(job, 5);

    const payload = GenerationJobPayloadSchema.parse(job.data);

    await this.reportProgress(job, 15);

    const acquireResult = await this.idempotencyManager.acquire(payload.idempotencyKey);

    if (!acquireResult.acquired) {
      if (acquireResult.record.state === 'completed') {
        await this.reportProgress(job, 100);
        return acquireResult.record.result ?? null;
      }

      if (acquireResult.record.state === 'locked') {
        throw new DuplicateActiveExecutionError(payload.idempotencyKey, acquireResult.record);
      }
    }

    await this.reportProgress(job, 30);

    const rpcRequest: PythonMlRpcRequest = {
      taskId: payload.jobId,
      idempotencyKey: payload.idempotencyKey,
      taskType: 'render_photobash',
      payload,
      timeoutMs: this.config.rpcTimeoutMs,
    };

    try {
      const rpcResponse = await this.rpcClient.compute(rpcRequest, this.config.rpcTimeoutMs);

      await this.reportProgress(job, 85);

      const result = rpcResponse.result ?? null;
      await this.idempotencyManager.settleSuccess(payload.idempotencyKey, result);

      await this.reportProgress(job, 100);

      return result;
    } catch (error) {
      await this.idempotencyManager.settleFailure(payload.idempotencyKey, error);
      throw error;
    }
  }

  private async reportProgress(
    job: Job<GenerationJobPayload, unknown, string>,
    progress: number,
  ): Promise<void> {
    if (typeof job.updateProgress !== 'function') {
      return;
    }

    await job.updateProgress(progress);
  }
}
