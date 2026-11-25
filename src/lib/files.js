// ================================================================
// Codelix OMS — file uploads through the backend file-service.
//   1. POST /files/init            → where to put the bytes
//   2. PUT  <uploadUrl | partUrls> → bytes go straight to storage
//   3. POST /files/{id}/complete   → the server confirms they arrived
//   4. GET  /files/{id}/url        → a short-lived link to read it back
// Links expire (about 15 minutes), so anything stored on a record keeps the
// file `id`; `useFileUrls` turns ids back into fresh links when they are shown.
// ================================================================
import { useEffect, useState } from 'react';
import { http, API_URL, query } from './http';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

// The local storage backend hands out paths ("/api/v1/public/files/blob?…"); S3 hands out full URLs.
const absolute = url => (url && url.startsWith('/') ? API_URL + url : url);

async function putBytes(url, blob, contentType) {
  let res;
  try {
    res = await fetch(absolute(url), { method: 'PUT', body: blob, headers: contentType ? { 'Content-Type': contentType } : {} });
  } catch {
    throw new Error('The upload was interrupted. Check your connection and try again.');
  }
  if (!res.ok) throw new Error(`The file could not be stored (${res.status}). Please try again.`);
  return res.headers.get('ETag');
}

const urlCache = new Map();   // file id → { url, until }
const FRESH_MS = 10 * 60 * 1000;

function remember(id, signed) {
  const ttl = Math.min(FRESH_MS, Math.max(30, (signed?.expiresInSeconds || 900) - 60) * 1000);
  const url = absolute(signed?.url);
  urlCache.set(id, { url, until: Date.now() + ttl });
  return url;
}

// A link the browser can open right now for a stored file.
export async function fileUrl(id, { inline = true } = {}) {
  const hit = urlCache.get(id);
  if (inline && hit && hit.until > Date.now()) return hit.url;
  const signed = await http.get(`/files/${id}/url${query({ inline })}`);
  return inline ? remember(id, signed) : absolute(signed?.url);
}

// uploadFile(file, { module, sourceId, type }) → { id, name, url, type, size }
// `module` + `sourceId` say which record the file belongs to (who may open it
// is decided from that on the server); leave both out for a private file.
export async function uploadFile(file, { module, sourceId, type } = {}) {
  if (!file) throw new Error('Choose a file to upload.');
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is over 20 MB and cannot be uploaded.`);
  if (!file.size) throw new Error(`${file.name} is empty and cannot be uploaded.`);
  const contentType = file.type || 'application/octet-stream';
  const linked = !!module && !!sourceId;

  const init = await http.post('/files/init', {
    name: file.name, size: file.size, contentType,
    sourceModule: linked ? module : null, sourceType: linked ? type || null : null, sourceId: linked ? sourceId : null,
  });

  try {
    let done = {};
    if (init.mode === 'MULTIPART') {
      const etags = [];
      for (let i = 0; i < init.partUrls.length; i++) {
        const etag = await putBytes(init.partUrls[i], file.slice(i * init.partSize, (i + 1) * init.partSize));
        if (!etag) throw new Error('The storage server did not confirm part of the upload. Please try again.');
        etags.push(etag);
      }
      done = { uploadId: init.uploadId, etags };
    } else {
      await putBytes(init.uploadUrl, file, contentType);
    }
    await http.post(`/files/${init.fileId}/complete`, done);
  } catch (e) {
    // release the reservation; the original error is the one worth showing
    http.del(`/files/${init.fileId}/upload${query({ uploadId: init.uploadId })}`).catch(() => {});
    throw e;
  }

  const url = remember(init.fileId, await http.get(`/files/${init.fileId}/url?inline=true`));
  return { id: init.fileId, name: file.name, url, type: file.type || contentType, size: file.size };
}

// Fresh links for a list of stored attachments ({ id, url, … }).
// Returns a function: urlOf(attachment) → link (the stored one until the fresh one arrives).
export function useFileUrls(items) {
  const ids = (items || []).map(a => a?.id).filter(Boolean).join(',');
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!ids) return;
    let off = false;
    const load = () => Promise.all(ids.split(',').map(id => fileUrl(id).catch(() => null))).then(() => { if (!off) setTick(t => t + 1); });
    load();
    const timer = setInterval(load, FRESH_MS);   // keep long-open screens working
    return () => { off = true; clearInterval(timer); };
  }, [ids]);
  return a => {
    if (!a) return undefined;
    const hit = a.id ? urlCache.get(a.id) : null;
    if (hit && hit.until > Date.now()) return hit.url;
    return a.id ? undefined : a.url;   // local previews (blob:) and old plain links have no id
  };
}
