import axios from 'axios';

/**
 * Upload a file straight to Azure Blob Storage through a write-only SAS URL,
 * in blocks. Large videos never pass through the API, so App Service's request
 * timeout can't cut them off, and there is no size limit beyond Azure's own.
 */
const BLOCK_SIZE = 8 * 1024 * 1024;
const PARALLEL = 4;
const RETRIES = 5;

function withQuery(sasUrl: string, extra: string): string {
  return `${sasUrl}${sasUrl.includes('?') ? '&' : '?'}${extra}`;
}

/** Block ids must all be the same length and base64-encoded. */
function blockId(i: number): string {
  return btoa(`block-${String(i).padStart(6, '0')}`);
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // 403 = the upload URL was refused (expired / not allowed); retrying can't help.
      if (attempt >= RETRIES || (axios.isAxiosError(err) && err.response?.status === 403)) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
  }
}

/** A readable reason for a failed storage request — Azure answers with an XML <Code>/<Message>. */
export function describeUploadError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return 'the connection to storage was interrupted or blocked';
    const body = typeof err.response.data === 'string' ? err.response.data : '';
    const code = /<Code>([^<]+)<\/Code>/.exec(body)?.[1];
    return `storage replied ${err.response.status}${code ? ` (${code})` : ''}`;
  }
  return err instanceof Error && err.message ? err.message : 'unknown error';
}

export async function uploadToBlob(sasUrl: string, file: File, onProgress?: (loaded: number) => void): Promise<void> {
  // Azure rejects zero-length blocks, so an empty file goes up as a single blob.
  if (file.size === 0) {
    await axios.put(sasUrl, file, {
      headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': file.type || 'application/octet-stream' },
    });
    return;
  }
  const count = Math.max(1, Math.ceil(file.size / BLOCK_SIZE));
  const loaded = new Array<number>(count).fill(0);
  const report = () => onProgress?.(loaded.reduce((a, b) => a + b, 0));

  let next = 0;
  const worker = async () => {
    while (next < count) {
      const i = next++;
      const chunk = file.slice(i * BLOCK_SIZE, Math.min(file.size, (i + 1) * BLOCK_SIZE));
      await withRetry(() =>
        axios.put(withQuery(sasUrl, `comp=block&blockid=${encodeURIComponent(blockId(i))}`), chunk, {
          headers: { 'Content-Type': 'application/octet-stream' },
          onUploadProgress: (e) => {
            loaded[i] = e.loaded;
            report();
          },
        })
      );
      loaded[i] = chunk.size;
      report();
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, count) }, worker));

  const blockList = Array.from({ length: count }, (_, i) => `<Latest>${blockId(i)}</Latest>`).join('');
  await withRetry(() =>
    axios.put(withQuery(sasUrl, 'comp=blocklist'), `<?xml version="1.0" encoding="utf-8"?><BlockList>${blockList}</BlockList>`, {
      headers: {
        'Content-Type': 'application/xml',
        'x-ms-blob-content-type': file.type || 'application/octet-stream',
        'x-ms-blob-cache-control': 'public, max-age=31536000, immutable',
      },
    })
  );
}
