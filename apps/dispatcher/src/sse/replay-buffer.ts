import { GenerationStreamEvent, GenerationStreamEventSchema } from '@aristocolors/contracts';
import { RedisLike } from './redis-like';

export interface GenerationStreamReplayBufferOptions {
  redis: RedisLike;
  keyPrefix?: string;
  ttlSeconds?: number;
}

export class GenerationStreamReplayBuffer {
  private readonly redis: RedisLike;
  private readonly keyPrefix: string;
  private readonly ttlSeconds: number;

  constructor(options: GenerationStreamReplayBufferOptions) {
    this.redis = options.redis;
    this.keyPrefix = options.keyPrefix ?? 'dispatcher:sse';
    this.ttlSeconds = options.ttlSeconds ?? 3600;
  }

  async append(
    event: Omit<GenerationStreamEvent, 'seq'> & { seq?: never },
  ): Promise<GenerationStreamEvent> {
    const seq = await this.redis.incr(this.sequenceKey(event.generationId));

    const storedEvent = GenerationStreamEventSchema.parse({
      ...event,
      seq,
    });

    await this.redis.zadd(
      this.eventsKey(storedEvent.generationId),
      storedEvent.seq,
      JSON.stringify(storedEvent),
    );

    await this.refreshTtl(storedEvent.generationId);

    return storedEvent;
  }

  async listAfter(generationId: string, seq: number): Promise<GenerationStreamEvent[]> {
    const minExclusive = Number.isFinite(seq) ? seq + Number.EPSILON : 0;

    const rawEvents = await this.redis.zrangebyscore(
      this.eventsKey(generationId),
      minExclusive,
      '+inf',
    );

    return rawEvents
      .map((rawEvent) => GenerationStreamEventSchema.parse(JSON.parse(rawEvent)))
      .sort((a, b) => a.seq - b.seq);
  }

  async getCurrentSequence(generationId: string): Promise<number> {
    const rawValue = await this.redis.get(this.sequenceKey(generationId));
    if (rawValue === null) {
      return 0;
    }

    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error(`Invalid sequence value for generationId "${generationId}"`);
    }

    return parsed;
  }

  async clear(generationId: string): Promise<void> {
    await this.redis.del(this.sequenceKey(generationId), this.eventsKey(generationId));
  }

  private async refreshTtl(generationId: string): Promise<void> {
    await this.redis.expire(this.sequenceKey(generationId), this.ttlSeconds);
    await this.redis.expire(this.eventsKey(generationId), this.ttlSeconds);
  }

  private sequenceKey(generationId: string): string {
    return `${this.keyPrefix}:generation:${generationId}:seq`;
  }

  private eventsKey(generationId: string): string {
    return `${this.keyPrefix}:generation:${generationId}:events`;
  }
}
