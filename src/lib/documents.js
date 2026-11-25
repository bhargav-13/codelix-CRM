// ================================================================
// Codelix OMS — client documents and the letter templates.
//
// The letter kinds are shared by the Templates page (not built yet: "coming
// soon") and the Client documents page (upload and keep each client's letters).
//
// A document is a private file in the file-service plus one line in the
// `client_documents` setting (partners only), which is the index this page
// lists:  { id, client, type, title, name, size, contentType, uploadedAt, uploadedBy }
// ================================================================
import { settingsDB } from './db';
import { http, ApiError } from './http';

export const DOC_TYPES = [
  { id: 'proposal',   label: 'Proposal letter',                         text: 'The offer sent to a client before work starts: what we will build, in how long and for how much.' },
  { id: 'sow',        label: 'SOW (scope of work)',                     text: 'Exactly what is included and what is not, with deliverables and timelines.' },
  { id: 'welcome',    label: 'Welcome letter',                          text: 'Sent when a client signs on: who their contacts are and what happens next.' },
  { id: 'nda',        label: 'NDA',                                     text: 'The confidentiality agreement signed with a client or vendor.' },
  { id: 'thank_you',  label: 'Thank you letter',                        text: 'Sent when a project is delivered or a payment is received.' },
  { id: 'milestones', label: 'Project milestones and payment schedule', text: 'Each milestone with its date, and the payment due against it.' },
];
export const OTHER_TYPE = { id: 'other', label: 'Other' };
export const docTypeLabel = id => DOC_TYPES.find(t => t.id === id)?.label || OTHER_TYPE.label;

const KEY = 'client_documents';

async function readIndex() {
  const v = await settingsDB.get(KEY);
  return Array.isArray(v) ? v : [];
}

export const documentsDB = {
  list: readIndex,
  // Re-reads the list right before writing, so two partners adding at once do not lose each other's line.
  add: async doc => {
    const next = [doc, ...(await readIndex()).filter(d => d.id !== doc.id)];
    await settingsDB.set(KEY, next);
    return next;
  },
  // Removes the stored file, then its line. A file that is already gone is not an error.
  remove: async id => {
    try { await http.del(`/files/${id}`); }
    catch (e) { if (!(e instanceof ApiError && e.status === 404)) throw e; }
    const next = (await readIndex()).filter(d => d.id !== id);
    await settingsDB.set(KEY, next);
    return next;
  },
};

export const fmtFileSize = bytes => {
  const b = +bytes || 0;
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} B`;
};
