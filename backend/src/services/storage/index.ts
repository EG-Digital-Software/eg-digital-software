import fs from 'node:fs/promises';
import path from 'node:path';
import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

/**
 * File-storage abstraction. Local disk in development, Azure Blob Storage in
 * production. Production must not assume a local filesystem — App Service
 * instances have ephemeral disks and lose uploads on every restart.
 */
export interface StorageProvider {
  save(key: string, data: Buffer, contentType?: string): Promise<string>;
  getUrl(key: string): string;
}

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
}

class AzureBlobStorage implements StorageProvider {
  private container: ContainerClient;
  private ready?: Promise<void>;

  constructor(connectionString: string, containerName: string) {
    this.container = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(
      containerName
    );
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
