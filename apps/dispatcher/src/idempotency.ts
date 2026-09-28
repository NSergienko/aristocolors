import type Redis from 'ioredis';

export type IdempotencyState = 'locked' | 'completed' | 'failed';

export interface IdempotencyRecord<T = unknown> {
  state: IdempotencyState;
  timestamp: string;
  result?: T;
  error?: unknown;
}

export type AcquireIdempotencyResult<T = unknown> =
  | {
      acquired: true;
      record: IdempotencyRecord<T>;
    }
  | {
      acquired: false;
      record: IdempotencyRecord<T>;
    };

export interface IdempotencyLockManagerOptions {
  redis?: Redis | null;
  keyPrefix?: string;
}

export class IdempotencyLockManager {
  private readonly redis: Redis | null;
  private readonly keyPrefix: string;
  private readonly memoryStore = new Map<string, MemoryEntry>();

  constructor(options: IdempotencyLockManagerOptions = {}) {
    this.redis = options.redis ?? null;
    this.keyPrefix = options.keyPrefix ?? 'dispatcher:idempotency';
  }

  async acquire<T = unknown>(
    idempotencyKey: string,
    ttlSeconds = 600,
  ): Promise<AcquireIdempotencyResult<T>> {
    if (this.redis) {
      return this.acquireWithRedis<T>(idempotencyKey, ttlSeconds);
    }

    return this.acquireInMemory<T>(idempotencyKey, ttlSeconds);
  }

  async settleSuccess<T = unknown>(
    idempotencyKey: string,
    result: T,
    ttlSeconds = 86400,
  ): Promise<IdempotencyRecord<T>> {
    const record: IdempotencyRecord<T> = {
      state: 'completed',
      timestamp: new Date().toISOString(),
      result,
    };

    if (this.redis) {
      await this.redis.set(this.buildKey(idempotencyKey), serializeRecord(record), 'EX', ttlSeconds);
      return record;
    }

    this.memoryStore.set(this.buildKey(idempotencyKey), {
      expiresAt: getExpiresAt(ttlSeconds),
      value: serializeRecord(record),
    });

    return record;
  }

  async settleFailure(
    idempotencyKey: string,
    error: unknown,
    ttlSeconds = 300,
  ): Promise<IdempotencyRecord<never>> {
    const record: IdempotencyRecord<never> = {
      state: 'failed',
      timestamp: new Date().toISOString(),
      error: toSerializableError(error),
    };

    if (this.redis) {
      await this.redis.set(this.buildKey(idempotencyKey), serializeRecord(record), 'EX', ttlSeconds);
      return record;
    }

    this.memoryStore.set(this.buildKey(idempotencyKey), {
      expiresAt: getExpiresAt(ttlSeconds),
      value: serializeRecord(record),
    });

    return record;
  }

  async release(idempotencyKey: string): Promise<void> {
    const key = this.buildKey(idempotencyKey);

    if (this.redis) {
      await this.redis.del(key);
      return;
    }

    this.purgeExpiredMemoryEntry(key);
    this.memoryStore.delete(key);
  }

  private async acquireWithRedis<T>(
    idempotencyKey: string,
    ttlSeconds: number,
  ): Promise<AcquireIdempotencyResult<T>> {
    const key = this.buildKey(idempotencyKey);
    const record: IdempotencyRecord = {
      state: 'locked',
      timestamp: new Date().toISOString(),
    };

    const setResult = await this.redis!.set(key, serializeRecord(record), 'EX', ttlSeconds, 'NX');

    if (setResult === 'OK') {
      return {
        acquired: true,
        record: record as IdempotencyRecord<T>,
      };
    }

    const existingRaw = await this.redis!.get(key);
    if (!existingRaw) {
      const retrySetResult = await this.redis!.set(key, serializeRecord(record), 'EX', ttlSeconds, 'NX');
      if (retrySetResult === 'OK') {
        return {
          acquired: true,
          record: record as IdempotencyRecord<T>,
        };
      }

      const fallbackRaw = await this.redis!.get(key);
      if (!fallbackRaw) {
        return {
          acquired: false,
          record: record as IdempotencyRecord<T>,
        };
      }

      return {
        acquired: false,
        record: deserializeRecord<T>(fallbackRaw),
      };
    }

    return {
      acquired: false,
      record: deserializeRecord<T>(existingRaw),
    };
  }

  private async acquireInMemory<T>(
    idempotencyKey: string,
    ttlSeconds: number,
  ): Promise<AcquireIdempotencyResult<T>> {
    const key = this.buildKey(idempotencyKey);
    this.purgeExpiredMemoryEntry(key);

    const existing = this.memoryStore.get(key);
    if (existing) {
      return {
        acquired: false,
        record: deserializeRecord<T>(existing.value),
      };
    }

    const record: IdempotencyRecord<T> = {
      state: 'locked',
      timestamp: new Date().toISOString(),
    };

    this.memoryStore.set(key, {
      expiresAt: getExpiresAt(ttlSeconds),
      value: serializeRecord(record),
    });

    return {
      acquired: true,
      record,
    };
  }

  private buildKey(idempotencyKey: string): string {
    return `${this.keyPrefix}:${idempotencyKey}`;
  }

  private purgeExpiredMemoryEntry(key: string): void {
    const entry = this.memoryStore.get(key);
    if (!entry) {
      return;
    }

    if (entry.expiresAt <= Date.now()) {
      this.memoryStore.delete(key);
    }
  }
}

interface MemoryEntry {
  expiresAt: number;
  value: string;
}

function serializeRecord(record: IdempotencyRecord): string {
  return JSON.stringify(record);
}

function deserializeRecord<T>(value: string): IdempotencyRecord<T> {
  const parsed = JSON.parse(value) as IdempotencyRecord<T>;

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed.state !== 'locked' && parsed.state !== 'completed' && parsed.state !== 'failed') ||
    typeof parsed.timestamp !== 'string'
  ) {
    throw new Error('Invalid idempotency record');
  }

  return parsed;
}

function getExpiresAt(ttlSeconds: number): number {
  return Date.now() + ttlSeconds * 1000;
}

function toSerializableError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (error === undefined) {
    return null;
  }

  try {
    JSON.stringify(error);
    return error;
  } catch {
    return {
      message: String(error),
    };
  }
}
