import {
  EntitlementsPolicySchema,
  FREE_TIER_ENTITLEMENTS,
  PRO_TIER_ENTITLEMENTS,
  STANDARD_TIER_ENTITLEMENTS,
  SubscriptionTierSchema,
  type EntitlementsPolicy,
  type MaxResolution,
  type SubscriptionTier,
} from '@aristocolors/contracts';

export interface UserSubscriptionRecord {
  userId: string;
  tier: SubscriptionTier;
  active: boolean;
  expiresAt?: string | null;
}

export interface ISubscriptionRepository {
  getActiveSubscriptionForUser(userId: string): Promise<UserSubscriptionRecord | null>;
}

export class InMemorySubscriptionRepository implements ISubscriptionRepository {
  private readonly subscriptions = new Map<string, UserSubscriptionRecord>();

  constructor(initialRecords: UserSubscriptionRecord[] = []) {
    for (const record of initialRecords) {
      this.subscriptions.set(record.userId, { ...record });
    }
  }

  async getActiveSubscriptionForUser(userId: string): Promise<UserSubscriptionRecord | null> {
    const record = this.subscriptions.get(userId);
    if (!record) {
      return null;
    }

    if (!record.active) {
      return null;
    }

    if (record.expiresAt) {
      const expiresAtMs = Date.parse(record.expiresAt);
      if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
        return null;
      }
    }

    return { ...record };
  }

  set(record: UserSubscriptionRecord): void {
    this.subscriptions.set(record.userId, { ...record });
  }

  delete(userId: string): void {
    this.subscriptions.delete(userId);
  }

  clear(): void {
    this.subscriptions.clear();
  }
}

const ENTITLEMENTS_BY_TIER: Record<SubscriptionTier, EntitlementsPolicy> = {
  free: FREE_TIER_ENTITLEMENTS,
  standard: STANDARD_TIER_ENTITLEMENTS,
  pro: PRO_TIER_ENTITLEMENTS,
  studio: PRO_TIER_ENTITLEMENTS,
};

export class UnauthorizedError extends Error {
  override readonly name = 'UnauthorizedError';

  constructor(message = 'Unauthorized') {
    super(message);
  }
}

export class ForbiddenCapabilityError extends Error {
  override readonly name = 'ForbiddenCapabilityError';
  readonly capability: string;

  constructor(capability: string, message?: string) {
    super(message ?? `Forbidden capability: ${capability}`);
    this.capability = capability;
  }
}

export class ConcurrencyLimitExceededError extends Error {
  override readonly name = 'ConcurrencyLimitExceededError';
  readonly scope: 'queued' | 'running';
  readonly limit: number;

  constructor(scope: 'queued' | 'running', limit: number, message?: string) {
    super(message ?? `Concurrency limit exceeded for ${scope}; limit=${limit}`);
    this.scope = scope;
    this.limit = limit;
  }
}

export async function resolveUserEntitlements(
  userId: string | null | undefined,
  repository: ISubscriptionRepository,
): Promise<EntitlementsPolicy> {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    throw new UnauthorizedError('Missing authenticated user identity');
  }

  const subscription = await repository.getActiveSubscriptionForUser(normalizedUserId);
  if (!subscription) {
    return FREE_TIER_ENTITLEMENTS;
  }

  const tier = SubscriptionTierSchema.parse(subscription.tier);
  const policy = ENTITLEMENTS_BY_TIER[tier] ?? FREE_TIER_ENTITLEMENTS;

  return EntitlementsPolicySchema.parse(policy);
}

export interface CapabilityGateInput {
  resolution?: string | null;
  commercial4KUpscale?: boolean | null;
  canvasLayerCount?: number | null;
  aristoColorsProfileCount?: number | null;
}

export function validateCapabilityGates(
  policy: EntitlementsPolicy,
  input: CapabilityGateInput,
): void {
  EntitlementsPolicySchema.parse(policy);

  if (input.resolution) {
    validateResolutionCapability(policy, input.resolution);
  }

  if (input.commercial4KUpscale === true && !policy.allowCommercial4KUpscale) {
    throw new ForbiddenCapabilityError(
      'allowCommercial4KUpscale',
      'Commercial 4K upscale is not allowed for the current subscription tier',
    );
  }

  if (
    typeof input.canvasLayerCount === 'number' &&
    Number.isFinite(input.canvasLayerCount) &&
    input.canvasLayerCount > policy.maxCanvasLayers
  ) {
    throw new ForbiddenCapabilityError(
      'maxCanvasLayers',
      `Canvas layer count exceeds entitlement limit of ${policy.maxCanvasLayers}`,
    );
  }

  if (
    typeof input.aristoColorsProfileCount === 'number' &&
    Number.isFinite(input.aristoColorsProfileCount) &&
    policy.aristoColorsProfileLimit !== 'unlimited' &&
    input.aristoColorsProfileCount > policy.aristoColorsProfileLimit
  ) {
    throw new ForbiddenCapabilityError(
      'aristoColorsProfileLimit',
      `AristoColors profile count exceeds entitlement limit of ${policy.aristoColorsProfileLimit}`,
    );
  }
}

function validateResolutionCapability(
  policy: EntitlementsPolicy,
  requestedResolution: string,
): void {
  const maxResolution = policy.maxResolution;
  const requestedArea = resolutionArea(requestedResolution);
  const maxAllowedArea = resolutionArea(maxResolution);

  if (requestedArea === null) {
    return;
  }

  if (maxAllowedArea === null) {
    throw new ForbiddenCapabilityError(
      'maxResolution',
      `Unsupported entitlement max resolution: ${maxResolution}`,
    );
  }

  if (requestedArea > maxAllowedArea) {
    throw new ForbiddenCapabilityError(
      'maxResolution',
      `Requested resolution exceeds entitlement max resolution of ${maxResolution}`,
    );
  }
}

function resolutionArea(value: string): number | null {
  const match = /^(\d+)x(\d+)$/i.exec(value.trim());
  if (!match) {
    return null;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  return width * height;
}

function normalizeUserId(userId: string | null | undefined): string {
  return typeof userId === 'string' ? userId.trim() : '';
}

export interface ConcurrencyKvStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<'OK'>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
}

export interface ConcurrencySlotManagerOptions {
  store?: ConcurrencyKvStore | null;
  keyPrefix?: string;
  ttlSeconds?: number;
}

export interface AcquireConcurrencySlotParams {
  userId: string;
  slotId: string;
  limit: number;
  scope: 'queued' | 'running';
}

export interface ReleaseConcurrencySlotParams {
  userId: string;
  slotId: string;
  scope: 'queued' | 'running';
}

export interface ConcurrencySlotManagerLike {
  acquire(params: AcquireConcurrencySlotParams): Promise<{ acquired: boolean; alreadyHeld: boolean; count: number }>;
  release(params: ReleaseConcurrencySlotParams): Promise<{ released: boolean; count: number }>;
  getCount(userId: string, scope: 'queued' | 'running'): Promise<number>;
}

export class InMemoryConcurrencyKvStore implements ConcurrencyKvStore {
  private readonly values = new Map<string, { value: string; expiresAt: number | null }>();

  async get(key: string): Promise<string | null> {
    this.cleanup(key);
    return this.values.get(key)?.value ?? null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    const existing = this.values.get(key);
    this.values.set(key, {
      value,
      expiresAt: existing?.expiresAt ?? null,
    });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      this.cleanup(key);
      if (this.values.delete(key)) {
        deleted += 1;
      }
    }
    return deleted;
  }

  async incr(key: string): Promise<number> {
    this.cleanup(key);

    const current = this.values.get(key);
    const currentValue = current ? Number(current.value) : 0;
    if (!Number.isInteger(currentValue)) {
      throw new Error(`Value at key "${key}" is not an integer`);
    }

    const next = currentValue + 1;
    this.values.set(key, {
      value: String(next),
      expiresAt: current?.expiresAt ?? null,
    });

    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.cleanup(key);

    const entry = this.values.get(key);
    if (!entry) {
      return 0;
    }

    if (!Number.isFinite(seconds) || seconds <= 0) {
      this.values.delete(key);
      return 1;
    }

    entry.expiresAt = Date.now() + Math.floor(seconds * 1000);
    return 1;
  }

  async ttl(key: string): Promise<number> {
    this.cleanup(key);

    const entry = this.values.get(key);
    if (!entry) {
      return -2;
    }

    if (entry.expiresAt === null) {
      return -1;
    }

    return Math.max(-2, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }

  private cleanup(key: string): void {
    const entry = this.values.get(key);
    if (!entry) {
      return;
    }

    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.values.delete(key);
    }
  }
}

export class ConcurrencySlotManager implements ConcurrencySlotManagerLike {
  private readonly store: ConcurrencyKvStore | null;
  private readonly keyPrefix: string;
  private readonly ttlSeconds: number;
  private readonly inMemoryScopes = new Map<string, Map<string, number>>();

  constructor(options: ConcurrencySlotManagerOptions = {}) {
    this.store = options.store ?? null;
    this.keyPrefix = options.keyPrefix ?? 'dispatcher:entitlements';
    this.ttlSeconds = options.ttlSeconds ?? 900;
  }

  async acquire(
    params: AcquireConcurrencySlotParams,
  ): Promise<{ acquired: boolean; alreadyHeld: boolean; count: number }> {
    const userId = normalizeRequiredValue(params.userId, 'userId');
    const slotId = normalizeRequiredValue(params.slotId, 'slotId');
    const scope = params.scope;
    const limit = normalizePositiveInteger(params.limit, 'limit');

    if (!this.store) {
      return this.acquireInMemory(userId, slotId, scope, limit);
    }

    const ownerKey = this.ownerKey(userId, scope, slotId);
    const counterKey = this.counterKey(userId, scope);

    const existingOwner = await this.store.get(ownerKey);
    if (existingOwner === '1') {
      await this.refreshTtl(ownerKey, counterKey);
      const count = await this.getCount(userId, scope);
      return {
        acquired: true,
        alreadyHeld: true,
        count,
      };
    }

    const nextCount = await this.store.incr(counterKey);

    if (nextCount > limit) {
      const decremented = await this.decrementCounter(counterKey);
      await this.store.expire(counterKey, this.ttlSeconds);

      throw new ConcurrencyLimitExceededError(
        scope,
        limit,
        `Concurrency limit exceeded for ${scope}; limit=${limit}; count=${decremented}`,
      );
    }

    await this.store.set(ownerKey, '1');
    await this.refreshTtl(ownerKey, counterKey);

    return {
      acquired: true,
      alreadyHeld: false,
      count: nextCount,
    };
  }

  async release(
    params: ReleaseConcurrencySlotParams,
  ): Promise<{ released: boolean; count: number }> {
    const userId = normalizeRequiredValue(params.userId, 'userId');
    const slotId = normalizeRequiredValue(params.slotId, 'slotId');
    const scope = params.scope;

    if (!this.store) {
      return this.releaseInMemory(userId, slotId, scope);
    }

    const ownerKey = this.ownerKey(userId, scope, slotId);
    const counterKey = this.counterKey(userId, scope);

    const existingOwner = await this.store.get(ownerKey);
    if (existingOwner !== '1') {
      const count = await this.getCount(userId, scope);
      return {
        released: false,
        count,
      };
    }

    await this.store.del(ownerKey);
    const count = await this.decrementCounter(counterKey);

    if (count <= 0) {
      await this.store.del(counterKey);
      return {
        released: true,
        count: 0,
      };
    }

    await this.store.expire(counterKey, this.ttlSeconds);

    return {
      released: true,
      count,
    };
  }

  async getCount(userId: string, scope: 'queued' | 'running'): Promise<number> {
    const normalizedUserId = normalizeRequiredValue(userId, 'userId');

    if (!this.store) {
      const scopeMap = this.inMemoryScopes.get(this.scopeKey(normalizedUserId, scope));
      return scopeMap?.size ?? 0;
    }

    const raw = await this.store.get(this.counterKey(normalizedUserId, scope));
    if (raw === null) {
      return 0;
    }

    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
  }

  private async acquireInMemory(
    userId: string,
    slotId: string,
    scope: 'queued' | 'running',
    limit: number,
  ): Promise<{ acquired: boolean; alreadyHeld: boolean; count: number }> {
    const key = this.scopeKey(userId, scope);
    const scopeMap = this.inMemoryScopes.get(key) ?? new Map<string, number>();
    this.cleanupInMemoryScope(scopeMap);

    if (scopeMap.has(slotId)) {
      scopeMap.set(slotId, this.nextExpiry());
      this.inMemoryScopes.set(key, scopeMap);
      return {
        acquired: true,
        alreadyHeld: true,
        count: scopeMap.size,
      };
    }

    if (scopeMap.size >= limit) {
      throw new ConcurrencyLimitExceededError(scope, limit);
    }

    scopeMap.set(slotId, this.nextExpiry());
    this.inMemoryScopes.set(key, scopeMap);

    return {
      acquired: true,
      alreadyHeld: false,
      count: scopeMap.size,
    };
  }

  private async releaseInMemory(
    userId: string,
    slotId: string,
    scope: 'queued' | 'running',
  ): Promise<{ released: boolean; count: number }> {
    const key = this.scopeKey(userId, scope);
    const scopeMap = this.inMemoryScopes.get(key);
    if (!scopeMap) {
      return {
        released: false,
        count: 0,
      };
    }

    this.cleanupInMemoryScope(scopeMap);

    const released = scopeMap.delete(slotId);

    if (scopeMap.size === 0) {
      this.inMemoryScopes.delete(key);
    } else {
      this.inMemoryScopes.set(key, scopeMap);
    }

    return {
      released,
      count: scopeMap.size,
    };
  }

  private cleanupInMemoryScope(scopeMap: Map<string, number>): void {
    const now = Date.now();
    for (const [slotId, expiresAt] of scopeMap.entries()) {
      if (expiresAt <= now) {
        scopeMap.delete(slotId);
      }
    }
  }

  private nextExpiry(): number {
    return Date.now() + this.ttlSeconds * 1000;
  }

  private async refreshTtl(ownerKey: string, counterKey: string): Promise<void> {
    await this.store?.expire(ownerKey, this.ttlSeconds);
    await this.store?.expire(counterKey, this.ttlSeconds);
  }

  private async decrementCounter(counterKey: string): Promise<number> {
    const raw = await this.store?.get(counterKey);
    if (raw === null || raw === undefined) {
      return 0;
    }

    const parsed = Number(raw);
    const current = Number.isInteger(parsed) ? parsed : 0;
    const next = Math.max(0, current - 1);

    if (next === 0) {
      await this.store?.del(counterKey);
      return 0;
    }

    await this.store?.set(counterKey, String(next));
    return next;
  }

  private ownerKey(userId: string, scope: 'queued' | 'running', slotId: string): string {
    return `${this.keyPrefix}:${scope}:${userId}:slot:${slotId}`;
  }

  private counterKey(userId: string, scope: 'queued' | 'running'): string {
    return `${this.keyPrefix}:${scope}:${userId}:count`;
  }

  private scopeKey(userId: string, scope: 'queued' | 'running'): string {
    return `${scope}:${userId}`;
  }
}

function normalizeRequiredValue(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new UnauthorizedError(`Missing required ${fieldName}`);
  }
  return normalized;
}

function normalizePositiveInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return value;
}

export function isResolutionWithinEntitlement(
  requestedResolution: string,
  maxResolution: MaxResolution,
): boolean {
  const requestedArea = resolutionArea(requestedResolution);
  const maxArea = resolutionArea(maxResolution);

  if (requestedArea === null || maxArea === null) {
    return false;
  }

  return requestedArea <= maxArea;
}
