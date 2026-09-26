import {
  R2Paths,
  R2_CORS_RULES,
  R2StorageService,
} from '../src';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('--- Starting Cloudflare R2 Provisioning & Invariant Verification ---');

console.log('1. Verifying R2 Bucket Directory Structure...');

const userId = '11111111-1111-4111-8111-111111111111';
const assetId = '22222222-2222-4222-8222-222222222222';
const generationId = '33333333-3333-4333-8333-333333333333';

const originalPath = R2Paths.original(userId, assetId, 'png');
assert(
  originalPath === `assets/originals/${userId}/${assetId}.png`,
  `Original path must match pattern, got: ${originalPath}`
);

const maskPath = R2Paths.mask(userId, assetId, 'png');
assert(
  maskPath === `assets/masks/${userId}/${assetId}.png`,
  `Mask path must match pattern, got: ${maskPath}`
);

const depthPath = R2Paths.intermediateDepth(userId, generationId, 'png');
assert(
  depthPath === `assets/intermediates/${userId}/${generationId}/depth.png`,
  `Intermediate depth path must match pattern, got: ${depthPath}`
);

const render916 = R2Paths.render(userId, generationId, '9:16', 'png');
assert(
  render916 === `assets/renders/${userId}/${generationId}/9x16.png`,
  `Render 9:16 path must match normalized ratio, got: ${render916}`
);

const render11 = R2Paths.render(userId, generationId, '1:1', 'png');
assert(
  render11 === `assets/renders/${userId}/${generationId}/1x1.png`,
  `Render 1:1 path must match normalized ratio, got: ${render11}`
);

const render169 = R2Paths.render(userId, generationId, '16:9', 'png');
assert(
  render169 === `assets/renders/${userId}/${generationId}/16x9.png`,
  `Render 16:9 path must match normalized ratio, got: ${render169}`
);

console.log('2. Verifying R2 CORS Rules for Direct-to-Storage PUT...');
assert(R2_CORS_RULES.length > 0, 'CORS rules must not be empty');
const rule = R2_CORS_RULES[0];
assert(rule.AllowedMethods?.includes('PUT') ?? false, 'CORS must allow PUT for presigned uploads');
assert(rule.AllowedMethods?.includes('GET') ?? false, 'CORS must allow GET');
assert(rule.AllowedHeaders?.includes('Content-Type') ?? false, 'CORS must allow Content-Type header');
assert(rule.AllowedHeaders?.includes('x-amz-checksum-sha256') ?? false, 'CORS must allow SHA-256 header');
assert(rule.ExposeHeaders?.includes('ETag') ?? false, 'CORS must expose ETag');

console.log('3. Verifying Pre-signed PUT URL & Upload Intent Generation...');
async function testUploadIntent() {
  const service = new R2StorageService({
    accountId: 'test-account-12345',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key-abcdefghijklmnopqrstuvwxyz',
    bucketName: 'aristocolors-production',
    publicDomain: 'https://cdn.aristocolors.art',
  });

  const uploadIntent = await service.createUploadIntent({
    storageKey: originalPath,
    mimeType: 'image/png',
    checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    expiresInSeconds: 600,
  });

  assert(uploadIntent.storageKey === originalPath, 'Storage key must match original');
  assert(uploadIntent.expiresInSeconds === 600, 'Expiration must match');
  assert(uploadIntent.headers['Content-Type'] === 'image/png', 'Header Content-Type must match');
  assert(
    uploadIntent.headers['x-amz-checksum-sha256'] ===
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'Header SHA256 must match'
  );

  assert(uploadIntent.uploadUrl.startsWith('https://test-account-12345.r2.cloudflarestorage.com/'), 'URL must target R2 endpoint');
  assert(uploadIntent.uploadUrl.includes('X-Amz-Signature='), 'Presigned URL must contain AWS Signature');

  const downloadUrl = await service.createDownloadUrl({
    storageKey: originalPath,
  });
  assert(downloadUrl.includes('X-Amz-Signature='), 'Download URL must be presigned');

  const publicUrl = service.getPublicUrl(originalPath);
  assert(
    publicUrl === `https://cdn.aristocolors.art/${originalPath}`,
    `Public URL must format correctly: ${publicUrl}`
  );
}

testUploadIntent()
  .then(() => {
    console.log('--- All Cloudflare R2 Provisioning & Invariant Tests Passed Successfully! ---');
  })
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
