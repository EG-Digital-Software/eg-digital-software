import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';

/**
 * File-storage abstraction. Local disk in development, pluggable to Azure Blob
 * Storage in production (implement AzureBlobStorage and switch on STORAGE_DRIVER).
 * Production must not assume a local filesystem.
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

// Placeholder for Azure Blob — wire @azure/storage-blob when enabling production.
class AzureBlobStorage implements StorageProvider {
  async save(): Promise<string> {
    throw new Error('AzureBlobStorage not yet configured — set STORAGE_DRIVER=local');
  }
  getUrl(key: string): string {
    return key;
  }
}

export const storage: StorageProvider =
  env.STORAGE_DRIVER === 'azure' ? new AzureBlobStorage() : new LocalStorage();
