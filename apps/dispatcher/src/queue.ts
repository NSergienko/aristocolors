import { Queue, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import type Redis from 'ioredis';
import {
  GenerationJobPayloadSchema,
  type GenerationJobPayload,
} from '@aristocolors/contracts';
import type { DispatcherConfig } from './config';

export interface GenerationQueueOptions {
  config: DispatcherConfig;
  redis?: Redis | null;
  queue?: Queue<GenerationJobPayload, unknown, string> | null;
  defaultJobOptions?: JobsOptions;
}

export interface EnqueueGenerationJobOptions {
  jobOptions?: JobsOptions;
}

export class DispatcherGenerationQueue {
  private readonly config: DispatcherConfig;
  private readonly redis: Redis | null;
  private readonly ownsRedis: boolean;
  private readonly queue: Queue<GenerationJobPayload, unknown, string>;
  private readonly ownsQueue: boolean;
  private readonly defaultJobOptions?: JobsOptions;

  constructor(options: GenerationQueueOptions) {
    this.config = options.config;
    this.defaultJobOptions = options.defaultJobOptions;

    if (options.queue) {
      this.queue = options.queue;
      this.redis = options.redis ?? null;
      this.ownsQueue = false;
      this.ownsRedis = false;
      return;
    }

    this.redis =
      options.redis ??
      new IORedis({
        host: this.config.redisHost,
        port: this.config.redisPort,
        lazyConnect: true,
        maxRetriesPerRequest: null,
      });

    this.ownsRedis = !options.redis;
    this.ownsQueue = true;

    this.queue = new Queue<GenerationJobPayload, unknown, string>(this.config.queueName, {
      connection: this.redis,
      defaultJobOptions: this.defaultJobOptions,
    });
  }

  async enqueue(
    payload: GenerationJobPayload,
    options: EnqueueGenerationJobOptions = {},
  ) {
    const validatedPayload = GenerationJobPayloadSchema.parse(payload);

    const mergedJobOptions: JobsOptions = {
      ...this.defaultJobOptions,
      ...options.jobOptions,
      jobId: validatedPayload.idempotencyKey,
    };

    return this.queue.add(this.config.queueName, validatedPayload, mergedJobOptions);
  }

  async close(): Promise<void> {
    if (this.ownsQueue) {
      await this.queue.close();
    }

    if (this.ownsRedis && this.redis && this.redis.status !== 'end') {
      await this.redis.quit();
    }
  }
}
