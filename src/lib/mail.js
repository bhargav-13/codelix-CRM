// Sending a document to a client from one of the company's addresses (partners only).
// The server keeps the list of allowed senders (MAIL_SENDERS), so nobody can send as anyone else.
import { http } from './http';

export const mailAPI = {
  // { mode: 'smtp' | 'outbox' | 'off', senders: [{ key, name, address }], notificationsFrom }
  senders: () => http.get('/mail/senders'),
  // { from, to: [..], cc: [..], subject, message, attachmentName, attachmentBase64 } → { from, to, mode }
  send: body => http.post('/mail/send', body),
};

// A Blob as base64 (no "data:" prefix), for the attachment.
export const blobToBase64 = blob => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(new Error('The PDF could not be read.'));
  r.readAsDataURL(blob);
});

// The sender a document starts with: payment letters from accounts, everything else from info.
export const DEFAULT_SENDER = { payment: 'transaction', proposal: 'info', milestones: 'info', delivery: 'info', nda: 'info', welcome: 'info', sow: 'info' };
