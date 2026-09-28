type RedisValue = string;

interface ExpiringValue {
  value: RedisValue;
  expiresAt: number | null;
}

interface SortedSetMember {
  score: number;
  member: string;
}

interface SortedSetState {
  members: Map<string, SortedSetMember>;
  expiresAt: number | null;
}

type MessageHandler = (message: string, channel: string) => void;

export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<'OK'>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  zadd(key: string, score: number, member: string): Promise<number>;
  zrangebyscore(key: string, min: number | string, max: number | string): Promise<string[]>;
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string, handler: MessageHandler): Promise<() => Promise<void>>;
}

function normalizeTtlMs(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }
  return Math.floor(seconds * 1000);
}

function scoreFromBound(bound: number | string, fallback: number): number {
  if (typeof bound === 'number') {
    return bound;
  }

  if (bound === '-inf') {
    return Number.NEGATIVE_INFINITY;
  }

  if (bound === '+inf') {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = Number(bound);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export class InMemoryRedisLike implements RedisLike {
  private readonly kv = new Map<string, ExpiringValue>();
  private readonly sortedSets = new Map<string, SortedSetState>();
  private readonly subscribers = new Map<string, Set<MessageHandler>>();

  async get(key: string): Promise<string | null> {
    this.cleanupKey(key);
    const entry = this.kv.get(key);
    return entry ? entry.value : null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    const existing = this.kv.get(key);
    this.kv.set(key, {
      value,
      expiresAt: existing?.expiresAt ?? null,
    });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;

    for (const key of keys) {
      this.cleanupKey(key);

      if (this.kv.delete(key)) {
        deleted += 1;
      }

      if (this.sortedSets.delete(key)) {
        deleted += 1;
      }
    }

    return deleted;
  }

  async incr(key: string): Promise<number> {
    this.cleanupKey(key);
    const existing = this.kv.get(key);

    let nextValue = 1;
    if (existing) {
      const current = Number(existing.value);
      if (!Number.isInteger(current)) {
        throw new Error(`Value at key "${key}" is not an integer`);
      }
      nextValue = current + 1;
    }

    this.kv.set(key, {
      value: String(nextValue),
      expiresAt: existing?.expiresAt ?? null,
    });

    return nextValue;
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.cleanupKey(key);
    const ttlMs = normalizeTtlMs(seconds);
    if (ttlMs <= 0) {
      await this.del(key);
      return 1;
    }

    const expiresAt = Date.now() + ttlMs;
    const kvEntry = this.kv.get(key);
    if (kvEntry) {
      kvEntry.expiresAt = expiresAt;
      return 1;
    }

    const sortedSet = this.sortedSets.get(key);
    if (sortedSet) {
      sortedSet.expiresAt = expiresAt;
      return 1;
    }

    return 0;
  }

  async ttl(key: string): Promise<number> {
    this.cleanupKey(key);

    const kvEntry = this.kv.get(key);
    if (kvEntry) {
      if (kvEntry.expiresAt === null) {
        return -1;
      }
      return Math.max(-2, Math.ceil((kvEntry.expiresAt - Date.now()) / 1000));
    }

    const sortedSet = this.sortedSets.get(key);
    if (sortedSet) {
      if (sortedSet.expiresAt === null) {
        return -1;
      }
      return Math.max(-2, Math.ceil((sortedSet.expiresAt - Date.now()) / 1000));
    }

    return -2;
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    this.cleanupKey(key);
    const sortedSet = this.getOrCreateSortedSet(key);
    const existed = sortedSet.members.has(member);

    sortedSet.members.set(member, { score, member });
    return existed ? 0 : 1;
  }

  async zrangebyscore(key: string, min: number | string, max: number | string): Promise<string[]> {
    this.cleanupKey(key);
    const sortedSet = this.sortedSets.get(key);
    if (!sortedSet) {
      return [];
    }

    const minScore = scoreFromBound(min, Number.NEGATIVE_INFINITY);
    const maxScore = scoreFromBound(max, Number.POSITIVE_INFINITY);

    return Array.from(sortedSet.members.values())
      .filter((entry) => entry.score >= minScore && entry.score <= maxScore)
      .sort((a, b) => {
        if (a.score !== b.score) {
          return a.score - b.score;
        }
        return a.member.localeCompare(b.member);
      })
      .map((entry) => entry.member);
  }

  async publish(channel: string, message: string): Promise<number> {
    const handlers = this.subscribers.get(channel);
    if (!handlers || handlers.size === 0) {
      return 0;
    }

    for (const handler of handlers) {
      handler(message, channel);
    }

    return handlers.size;
  }

  async subscribe(channel: string, handler: MessageHandler): Promise<() => Promise<void>> {
    const handlers = this.subscribers.get(channel) ?? new Set<MessageHandler>();
    handlers.add(handler);
    this.subscribers.set(channel, handlers);

    return async () => {
      const currentHandlers = this.subscribers.get(channel);
      if (!currentHandlers) {
        return;
      }

      currentHandlers.delete(handler);
      if (currentHandlers.size === 0) {
        this.subscribers.delete(channel);
      }
    };
  }

  private getOrCreateSortedSet(key: string): SortedSetState {
    const existing = this.sortedSets.get(key);
    if (existing) {
      return existing;
    }

    const created: SortedSetState = {
      members: new Map<string, SortedSetMember>(),
      expiresAt: null,
    };

    this.sortedSets.set(key, created);
    return created;
  }

  private cleanupKey(key: string): void {
    const now = Date.now();

    const kvEntry = this.kv.get(key);
    if (kvEntry && kvEntry.expiresAt !== null && kvEntry.expiresAt <= now) {
      this.kv.delete(key);
    }

    const sortedSet = this.sortedSets.get(key);
    if (sortedSet && sortedSet.expiresAt !== null && sortedSet.expiresAt <= now) {
      this.sortedSets.delete(key);
    }
  }
}
