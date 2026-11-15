import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { API_URL } from '../../config';
import { getSession, refreshSession } from '../../api/client';
import type { AdminDocument } from '../../api/admin/customers';
import { fileUrl } from './common';

/** ArrayBuffer → base64 (chunked so big files don't overflow the call stack). */
export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x2000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
}

/**
 * A customer document's bytes (base64) through the admin proxy — the signed copy
 * when asked and present, else the original — falling back to the stored file.
 */
export async function fetchDocBase64(clientId: string, documentId: string, signed: boolean, direct?: string | null): Promise<string> {
  const viaApi = async (withSigned: boolean) => {
    const url = `${API_URL}/customers/${encodeURIComponent(clientId)}/documents/${encodeURIComponent(documentId)}/file${withSigned ? '?signed=1' : ''}`;
    const get = () => fetch(url, { headers: { 'X-Client': 'mobile', Authorization: `Bearer ${getSession()?.accessToken ?? ''}` } });
    let res = await get();
    if (res.status === 401 && (await refreshSession())) res = await get();
    return res;
  };
  let res = await viaApi(signed);
  if (!res.ok && signed) res = await viaApi(false);
  if (!res.ok && direct) {
    const fallback = await fetch(fileUrl(direct)).catch(() => null);
    if (fallback?.ok) res = fallback;
  }
  if (!res.ok) throw new Error(`Could not download the document (${res.status})`);
  return toBase64(await res.arrayBuffer());
}

/** Safe file name for the cache (keeps the extension). */
const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'document';

/**
 * Download a document (the signed copy when there is one, as the web's download
 * link) to the cache and open the share sheet so it can be saved or sent.
 */
export async function downloadAndShare(clientId: string, d: AdminDocument): Promise<void> {
  const signed = !!d.signedUrl;
  const b64 = await fetchDocBase64(clientId, d.id, signed, d.signedUrl || d.url);
  const file = new File(Paths.cache, safeName(d.fileName));
  if (file.exists) file.delete();
  file.create();
  file.write(b64, { encoding: 'base64' });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  const pdf = d.contentType === 'application/pdf' || /\.pdf$/i.test(d.fileName);
  await Sharing.shareAsync(file.uri, {
    mimeType: d.contentType || (pdf ? 'application/pdf' : undefined),
    UTI: pdf ? 'com.adobe.pdf' : undefined,
    dialogTitle: d.fileName,
  });
}
