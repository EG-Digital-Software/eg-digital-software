import fs from 'node:fs/promises';
import path from 'node:path';
import { BlobSASPermissions, BlobServiceClient, type ContainerClient } from '@azure/storage-blob';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

// Origins allowed to fetch() blob bytes cross-origin. Direct <a href> downloads
// are not CORS-checked, but reading a blob with fetch (e.g. rendering an
// agreement PDF in a dialog) is — without these rules Azure returns no
// Access-Control-Allow-Origin and the browser reports "Failed to fetch".
const blobCorsOrigins = env.CORS_ORIGIN.split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

/**
 * File-storage abstraction. Local disk in development, Azure Blob Storage in
 * production. Production must not assume a local filesystem — App Service
 * instances have ephemeral disks and lose uploads on every restart.
 */
export interface StorageProvider {
  save(key: string, data: Buffer, contentType?: string): Promise<string>;
  getUrl(key: string): string;
  /** Delete a stored file. Accepts the value persisted on the record (the URL
   *  returned by save) or a raw key. Best-effort: a missing file is not an error. */
  remove(urlOrKey: string): Promise<void>;
  /**
   * A short-lived, write-only URL the browser uploads a file to directly, so
   * large files never stream through the API (App Service cuts requests that
   * run past ~230s). Null when the driver can't issue one — callers then fall
   * back to a normal multipart upload.
   */
  createDirectUpload(key: string): Promise<{ uploadUrl: string; url: string } | null>;
  /**
   * Confirm a directly uploaded file and return its size. Null when `url`
   * isn't a blob under `keyPrefix` (or the driver has no direct uploads);
   * `{ error }` explains a file that didn't arrive whole.
   */
  statUpload(url: string, keyPrefix: string, expect?: UploadExpectation): Promise<UploadStat | null>;
}

/** What the browser says it uploaded — lets the server finish or check the blob. */
export type UploadExpectation = { contentType?: string; size?: number };
export type UploadStat = { size: number } | { error: string };

class LocalStorage implements StorageProvider {
  private root = path.resolve(process.cwd(), 'uploads');

  async save(key: string, data: Buffer): Promise<string> {
    const dest = path.join(this.root, key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, data);
    return this.getUrl(key);
  }

  getUrl(key: string): string {
    return `/uploads/${key}`;
  }

  async remove(urlOrKey: string): Promise<void> {
    const key = urlOrKey.startsWith('/uploads/') ? urlOrKey.slice('/uploads/'.length) : urlOrKey;
    await fs.rm(path.join(this.root, key), { force: true });
  }

  async createDirectUpload(): Promise<null> {
    return null;
  }

  async statUpload(): Promise<null> {
    return null;
  }
}

/** HTTP status / Azure error code of a storage SDK error, if any. */
const statusOf = (err: unknown) => (err as { statusCode?: number })?.statusCode;
const codeOf = (err: unknown) =>
  (err as { details?: { errorCode?: string }; code?: string })?.details?.errorCode ?? (err as { code?: string })?.code;

class AzureBlobStorage implements StorageProvider {
  private service: BlobServiceClient;
  private container: ContainerClient;
  private ready?: Promise<void>;
  private corsReady?: Promise<void>;

  constructor(connectionString: string, containerName: string) {
    this.service = BlobServiceClient.fromConnectionString(connectionString);
    this.container = this.service.getContainerClient(containerName);
    // Apply CORS at boot so blobs are fetchable before the first upload.
    void this.ensureCors();
  }

  /**
   * Allow the frontend origin(s) to fetch() blob bytes. Azure Blob Storage ships
   * with no CORS rules, so a cross-origin fetch (rendering a PDF in a dialog)
   * fails even though the container is publicly readable. Set once, best-effort:
   * a permission failure here must not break uploads. Existing rules are kept.
   */
  private ensureCors(): Promise<void> {
    this.corsReady ??= (async () => {
      if (blobCorsOrigins.length === 0) return;
      try {
        const props = await this.service.getProperties();
        const existing = props.cors ?? [];
        const covering = existing.find((r) => {
          const origins = r.allowedOrigins.split(',').map((o) => o.trim().replace(/\/$/, ''));
          return origins.includes('*') || blobCorsOrigins.every((o) => origins.includes(o));
        });
        if (covering) {
          // Direct browser uploads PUT blocks straight to the blob, so the rule
          // must allow PUT as well as reads. Add it in place; nothing else changes.
          const methods = covering.allowedMethods.split(',').map((m) => m.trim().toUpperCase());
          if (methods.includes('PUT')) return;
          covering.allowedMethods = [...methods, 'PUT'].join(',');
          await this.service.setProperties({ cors: existing });
          return;
        }
        existing.push({
          allowedOrigins: blobCorsOrigins.join(','),
          allowedMethods: 'GET,HEAD,OPTIONS,PUT',
          allowedHeaders: '*',
          exposedHeaders: '*',
          maxAgeInSeconds: 3600,
        });
        await this.service.setProperties({ cors: existing });
      } catch (err) {
        logger.warn(
          { err },
          'Could not configure blob CORS rules — cross-origin document fetches may fail. Add a CORS rule for the frontend origin on the storage account.'
        );
      }
    })();
    return this.corsReady;
  }

  /**
   * Blob URLs are persisted on the record, so they must stay valid forever —
   * hence a publicly readable container rather than expiring SAS links. Falls
   * back to a private container when the account disallows anonymous access,
   * so a misconfigured account degrades instead of failing every upload.
   */
  private ensureContainer(): Promise<void> {
    this.ready ??= this.container
      .createIfNotExists({ access: 'blob' })
      .then(() => undefined)
      .catch(async (err: unknown) => {
        logger.warn(
          { err },
          'Blob container could not be created with public read access — creating it private. Enable anonymous blob access on the storage account, or uploaded files will not load.'
        );
        await this.container.createIfNotExists();
      });
    return this.ready;
  }

  async save(key: string, data: Buffer, contentType?: string): Promise<string> {
    await this.ensureContainer();
    void this.ensureCors();
    const blob = this.container.getBlockBlobClient(key);
    await blob.uploadData(data, {
      blobHTTPHeaders: {
        blobContentType: contentType ?? 'application/octet-stream',
        blobCacheControl: 'public, max-age=31536000, immutable',
      },
    });
    return blob.url;
  }

  getUrl(key: string): string {
    return this.container.getBlockBlobClient(key).url;
  }

  async remove(urlOrKey: string): Promise<void> {
    await this.ensureContainer();
    // Records store the absolute blob URL; strip the container prefix (and any
    // query string) back to the blob name before deleting.
    const base = this.container.url;
    let blobName = urlOrKey;
    if (urlOrKey.startsWith(base)) {
      blobName = decodeURIComponent(urlOrKey.slice(base.length).replace(/^\/+/, '').split('?')[0]);
    }
    await this.container.getBlockBlobClient(blobName).deleteIfExists();
  }

  async createDirectUpload(key: string): Promise<{ uploadUrl: string; url: string } | null> {
    await this.ensureContainer();
    await this.ensureCors();
    const blob = this.container.getBlockBlobClient(key);
    try {
      // Scoped to this one blob, create/write only, and long enough for a very
      // large video on a slow connection.
      const uploadUrl = await blob.generateSasUrl({
        permissions: BlobSASPermissions.parse('cw'),
        expiresOn: new Date(Date.now() + 12 * 60 * 60 * 1000),
      });
      return { uploadUrl, url: blob.url };
    } catch (err) {
      // A connection string without an account key can't sign SAS URLs.
      logger.warn({ err }, 'Could not sign a direct-upload URL — falling back to uploads through the API');
      return null;
    }
  }

  async statUpload(url: string, keyPrefix: string, expect: UploadExpectation = {}): Promise<UploadStat | null> {
    const base = `${this.container.url}/`;
    if (!url.startsWith(base) || url.includes('?')) return null;
    const blobName = decodeURIComponent(url.slice(base.length));
    if (!blobName.startsWith(keyPrefix) || blobName.split('/').includes('..')) return null;
    const blob = this.container.getBlockBlobClient(blobName);

    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      try {
        const size = (await blob.getProperties()).contentLength ?? 0;
        if (expect.size !== undefined && size !== expect.size) {
          logger.warn({ blobName, size, expected: expect.size }, 'Direct upload is incomplete');
          return { error: `only ${size} of ${expect.size} bytes arrived` };
        }
        return { size };
      } catch (err) {
        lastError = err;
        if (statusOf(err) !== 404) continue; // transient — check again
        // The blob was never committed. If the browser's blocks did reach
        // storage (only its final "join the blocks" request got lost), join
        // them here so the upload still completes.
        const committed = await this.commitStagedBlocks(blob, blobName, expect);
        if (committed) return committed;
        logger.warn({ blobName }, 'Direct upload never reached storage (no blob, no staged blocks)');
        return { error: 'the file never reached storage — the upload was blocked or interrupted' };
      }
    }
    logger.warn({ err: lastError, blobName }, 'Could not confirm a direct upload');
    return { error: `storage could not be checked (${codeOf(lastError) ?? 'unknown error'})` };
  }

  /** Commit a direct upload's staged-but-uncommitted blocks, in upload order. */
  private async commitStagedBlocks(
    blob: ReturnType<ContainerClient['getBlockBlobClient']>,
    blobName: string,
    expect: UploadExpectation
  ): Promise<UploadStat | null> {
    try {
      const list = await blob.getBlockList('uncommitted');
      const blocks = list.uncommittedBlocks ?? [];
      if (blocks.length === 0) return null;
      // Block ids are "block-000000", "block-000001", … (base64) — sort by that.
      const ids = blocks
        .map((b) => b.name)
        .sort((a, b) => Buffer.from(a, 'base64').toString().localeCompare(Buffer.from(b, 'base64').toString()));
      const staged = blocks.reduce((n, b) => n + b.size, 0);
      if (expect.size !== undefined && staged !== expect.size) {
        logger.warn({ blobName, staged, expected: expect.size }, 'Direct upload has missing blocks');
        return { error: `only ${staged} of ${expect.size} bytes arrived` };
      }
      await blob.commitBlockList(ids, {
        blobHTTPHeaders: {
          blobContentType: expect.contentType || 'application/octet-stream',
          blobCacheControl: 'public, max-age=31536000, immutable',
        },
      });
      logger.info({ blobName, blocks: ids.length }, 'Committed a direct upload on the server');
      const size = (await blob.getProperties()).contentLength ?? 0;
      return { size };
    } catch (err) {
      // No blob and no blocks at all — nothing of the upload reached storage.
      if (statusOf(err) === 404) return null;
      logger.warn({ err, blobName }, 'Could not commit staged blocks of a direct upload');
      return { error: `the upload could not be completed (${codeOf(err) ?? 'unknown error'})` };
    }
  }
}

function createStorage(): StorageProvider {
  if (env.STORAGE_DRIVER !== 'azure') return new LocalStorage();

  // env.ts already rejects an azure driver without a connection string; this
  // keeps the non-null assertion out of the constructor call.
  const connectionString = env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is required when STORAGE_DRIVER=azure');
  }
  return new AzureBlobStorage(connectionString, env.AZURE_STORAGE_CONTAINER);
}

export const storage: StorageProvider = createStorage();
