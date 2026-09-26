import type { CORSRule } from '@aws-sdk/client-s3';

/**
 * Cloudflare R2 CORS Configuration
 * Tailored for direct Pre-signed PUT uploads from browser / web studio
 * without routing heavy payloads through the Node.js API Gateway.
 */
export const R2_CORS_RULES: CORSRule[] = [
  {
    AllowedOrigins: [
      'https://*.pages.dev',
      'https://*.workers.dev',
      'https://*.run.app',
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
    ],
    AllowedMethods: ['GET', 'PUT', 'HEAD'],
    AllowedHeaders: [
      'Content-Type',
      'Content-Length',
      'Content-MD5',
      'x-amz-checksum-sha256',
      'x-amz-content-sha256',
      'x-amz-meta-*',
      'x-amz-date',
      'authorization',
    ],
    ExposeHeaders: [
      'ETag',
      'x-amz-checksum-sha256',
      'Content-Length',
      'Content-Type',
    ],
    MaxAgeSeconds: 86400,
  },
];
