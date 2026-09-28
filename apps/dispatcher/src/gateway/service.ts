import { createHash, randomInt, randomUUID } from 'node:crypto';
import {
  BlendResponseSchema,
  GenerationJobPayloadSchema,
  type BlendRequest,
  type BlendResponse,
  type GenerationJobPayload,
} from '@aristocolors/contracts';
import { IdempotencyLockManager, type IdempotencyRecord } from '../idempotency';
import { DispatcherGenerationQueue } from '../queue';

export interface BlendGatewayGenerationRecord {
  generationId: string;
  jobId: string;
  idempotencyKey: string;
  projectId: string;
  userId: string;
  status: string;
  createdAt: string;
}

export interface BlendGatewayRepository {
  findByIdempotencyKey(idempotencyKey: string): Promise<BlendGatewayGenerationRecord | null>;
  saveGeneration(record: BlendGatewayGenerationRecord): Promise<void>;
  getProfileVersion(aristoColorsId: string): Promise<string | null>;
  getSourceAssetChecksums(sourceAssetIds: string[]): Promise<Record<string, string>>;
}

export interface BlendGatewayServiceOptions {
  idempotencyManager: IdempotencyLockManager;
  compilerVersion: string;
  repository: BlendGatewayRepository;
  jobQueue?: DispatcherGenerationQueue | null;
}

export interface CreateBlendGenerationParams {
  projectId: string;
  idempotencyKey: string;
  userId: string;
  request: BlendRequest;
}

export class DuplicateBlendExecutionError extends Error {
  public readonly name = 'DuplicateBlendExecutionError';
  public readonly idempotencyKey: string;
  public readonly record: IdempotencyRecord<unknown>;

  constructor(idempotencyKey: string, record: IdempotencyRecord<unknown>) {
    super(`Duplicate active blend execution for idempotency key ${idempotencyKey}`);
    this.idempotencyKey = idempotencyKey;
    this.record = record;
  }
}

export class MissingProfileVersionError extends Error {
  public readonly name = 'MissingProfileVersionError';
  public readonly aristoColorsId: string;

  constructor(aristoColorsId: string) {
    super(`Profile version not found for AristoColors profile ${aristoColorsId}`);
    this.aristoColorsId = aristoColorsId;
  }
}

export class MissingSourceAssetChecksumError extends Error {
  public readonly name = 'MissingSourceAssetChecksumError';
  public readonly sourceAssetId: string;

  constructor(sourceAssetId: string) {
    super(`Source asset checksum not found for sourceAssetId ${sourceAssetId}`);
    this.sourceAssetId = sourceAssetId;
  }
}

export class BlendGatewayService {
  private readonly idempotencyManager: IdempotencyLockManager;
  private readonly compilerVersion: string;
  private readonly repository: BlendGatewayRepository;
  private readonly jobQueue: DispatcherGenerationQueue | null;

  constructor(options: BlendGatewayServiceOptions) {
    if (!options.compilerVersion || options.compilerVersion.trim().length === 0) {
      throw new Error('compilerVersion is required');
    }

    this.idempotencyManager = options.idempotencyManager;
    this.compilerVersion = options.compilerVersion;
    this.repository = options.repository;
    this.jobQueue = options.jobQueue ?? null;
  }

  async createBlendGeneration(params: CreateBlendGenerationParams): Promise<BlendResponse> {
    const existingGeneration = await this.repository.findByIdempotencyKey(params.idempotencyKey);
    if (existingGeneration) {
      return BlendResponseSchema.parse({
        success: true,
        generationId: existingGeneration.generationId,
        jobId: existingGeneration.jobId,
        idempotencyKey: existingGeneration.idempotencyKey,
        status: existingGeneration.status,
        isExisting: true,
        createdAt: existingGeneration.createdAt,
      });
    }

    const acquireResult = await this.idempotencyManager.acquire<BlendResponse>(params.idempotencyKey);

    if (!acquireResult.acquired) {
      if (acquireResult.record.state === 'completed') {
        return this.toExistingCachedBlendResponse(acquireResult.record);
      }

      if (acquireResult.record.state === 'locked') {
        throw new DuplicateBlendExecutionError(params.idempotencyKey, acquireResult.record);
      }
    }

    try {
      const seed = params.request.seed ?? randomInt(0, 2147483647);
      const generationId = randomUUID();
      const jobId = generationId;
      const createdAt = new Date().toISOString();
      const manifestSnapshot = params.request.manifestSnapshot;
      const profileVersion = await this.repository.getProfileVersion(params.request.aristoColorsId);

      if (!profileVersion) {
        throw new MissingProfileVersionError(params.request.aristoColorsId);
      }

      const sourceAssetIds = Array.from(
        new Set(manifestSnapshot.layers.map((layer) => layer.sourceAssetId)),
      );

      const sourceAssetChecksums = await this.repository.getSourceAssetChecksums(sourceAssetIds);

      for (const sourceAssetId of sourceAssetIds) {
        const checksum = sourceAssetChecksums[sourceAssetId];
        if (!checksum) {
          throw new MissingSourceAssetChecksumError(sourceAssetId);
        }
      }

      const manifestChecksumSha256 = sha256Json(manifestSnapshot);

      const jobPayload: GenerationJobPayload = GenerationJobPayloadSchema.parse({
        idempotencyKey: params.idempotencyKey,
        jobId,
        projectId: params.projectId,
        userId: params.userId,
        aristoColorsId: params.request.aristoColorsId,
        targetProvider: params.request.targetProvider,
        resolution: params.request.resolution,
        harmonizationIntensity: params.request.harmonizationIntensity,
        seed,
        priority: 5,
        manifestSnapshot,
        provenance: {
          manifestVersion: manifestSnapshot.version,
          manifestChecksumSha256,
          compilerVersion: this.compilerVersion,
          profileVersion,
          sourceAssetChecksums,
          seed,
          targetProvider: params.request.targetProvider,
          resolution: params.request.resolution,
          createdAt,
        },
      });

      if (this.jobQueue) {
        await this.jobQueue.enqueue(jobPayload);
      }

      const generationRecord: BlendGatewayGenerationRecord = {
        generationId,
        jobId,
        idempotencyKey: params.idempotencyKey,
        projectId: params.projectId,
        userId: params.userId,
        status: 'queued',
        createdAt,
      };

      await this.repository.saveGeneration(generationRecord);

      const response = BlendResponseSchema.parse({
        success: true,
        generationId,
        jobId,
        idempotencyKey: params.idempotencyKey,
        status: 'queued',
        isExisting: false,
        createdAt,
      });

      await this.idempotencyManager.settleSuccess(params.idempotencyKey, response);

      return response;
    } catch (error) {
      await this.idempotencyManager.settleFailure(params.idempotencyKey, error);
      throw error;
    }
  }

  private toExistingCachedBlendResponse(record: IdempotencyRecord<BlendResponse>): BlendResponse {
    const cachedResponse = BlendResponseSchema.parse(record.result);

    return BlendResponseSchema.parse({
      ...cachedResponse,
      isExisting: true,
    });
  }
}

export class InMemoryBlendGatewayRepository implements BlendGatewayRepository {
  private readonly generations = new Map<string, BlendGatewayGenerationRecord>();
  private readonly profileVersions = new Map<string, string>();
  private readonly sourceAssetChecksums = new Map<string, string>();

  async findByIdempotencyKey(idempotencyKey: string): Promise<BlendGatewayGenerationRecord | null> {
    return this.generations.get(idempotencyKey) ?? null;
  }

  async saveGeneration(record: BlendGatewayGenerationRecord): Promise<void> {
    this.generations.set(record.idempotencyKey, { ...record });
  }

  async getProfileVersion(aristoColorsId: string): Promise<string | null> {
    return this.profileVersions.get(aristoColorsId) ?? null;
  }

  async getSourceAssetChecksums(sourceAssetIds: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    for (const sourceAssetId of sourceAssetIds) {
      const checksum = this.sourceAssetChecksums.get(sourceAssetId);
      if (checksum) {
        result[sourceAssetId] = checksum;
      }
    }

    return result;
  }

  setProfileVersion(aristoColorsId: string, profileVersion: string): void {
    this.profileVersions.set(aristoColorsId, profileVersion);
  }

  setSourceAssetChecksum(sourceAssetId: string, checksumSha256: string): void {
    this.sourceAssetChecksums.set(sourceAssetId, checksumSha256);
  }

  seedGeneration(record: BlendGatewayGenerationRecord): void {
    this.generations.set(record.idempotencyKey, { ...record });
  }
}

function sha256Json(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
