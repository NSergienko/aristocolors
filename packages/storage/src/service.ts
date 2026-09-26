import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  PutBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { R2_CORS_RULES } from './cors';
import { R2Paths } from './paths';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicDomain?: string;
}

export interface UploadIntentParams {
  storageKey: string;
  mimeType: string;
  checksumSha256?: string;
  expiresInSeconds?: number;
}

export interface UploadIntentResult {
  uploadUrl: string;
  storageKey: string;
  headers: Record<string, string>;
  expiresInSeconds: number;
}

export interface DownloadIntentParams {
  storageKey: string;
  expiresInSeconds?: number;
}

export class R2StorageService {
  private client: S3Client;
  private bucketName: string;
  private publicDomain?: string;

  constructor(config?: Partial<R2Config>) {
    const accountId = config?.accountId || process.env.R2_ACCOUNT_ID || 'mock-r2-account';
    const accessKeyId = config?.accessKeyId || process.env.R2_ACCESS_KEY_ID || 'mock-access-key';
    const secretAccessKey = config?.secretAccessKey || process.env.R2_SECRET_ACCESS_KEY || 'mock-secret-key';
    this.bucketName = config?.bucketName || process.env.R2_BUCKET_NAME || 'aristocolors-assets';
    this.publicDomain = config?.publicDomain || process.env.R2_PUBLIC_DOMAIN;

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  async createUploadIntent(params: UploadIntentParams): Promise<UploadIntentResult> {
    const expiresIn = params.expiresInSeconds ?? 900;
    const headers: Record<string, string> = {
      'Content-Type': params.mimeType,
    };

    if (params.checksumSha256) {
      headers['x-amz-checksum-sha256'] = params.checksumSha256;
    }

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: params.storageKey,
      ContentType: params.mimeType,
      ...(params.checksumSha256
        ? {
            ChecksumSHA256: params.checksumSha256,
          }
        : {}),
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn,
    });

    return {
      uploadUrl,
      storageKey: params.storageKey,
      headers,
      expiresInSeconds: expiresIn,
    };
  }

  async createDownloadUrl(params: DownloadIntentParams): Promise<string> {
    const expiresIn = params.expiresInSeconds ?? 3600;
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: params.storageKey,
    });

    return await getSignedUrl(this.client, command, { expiresIn });
  }

  async getObjectMetadata(storageKey: string) {
    const command = new HeadObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
    });
    return await this.client.send(command);
  }

  async deleteObject(storageKey: string) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
    });
    return await this.client.send(command);
  }

  async configureBucketCors(): Promise<void> {
    const command = new PutBucketCorsCommand({
      Bucket: this.bucketName,
      CORSConfiguration: {
        CORSRules: R2_CORS_RULES,
      },
    });
    await this.client.send(command);
  }

  getPublicUrl(storageKey: string): string | null {
    if (!this.publicDomain) return null;
    const cleanDomain = this.publicDomain.replace(/\/+$/, '');
    return `${cleanDomain}/${storageKey}`;
  }

  getClient(): S3Client {
    return this.client;
  }

  getBucketName(): string {
    return this.bucketName;
  }
}

export const r2 = new R2StorageService();

export { R2Paths };
