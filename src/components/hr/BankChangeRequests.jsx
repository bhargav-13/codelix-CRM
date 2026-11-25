// Partner: employees' requests to change where their salary is paid. Shows the
// details on file next to the new ones, so the change can be checked with the
// person (ideally on a call) before approving. Hidden when nothing is waiting.
import { useCallback, useEffect, useState } from 'react';
import { Banknote } from 'lucide-react';
import Modal from '../ui/Modal';
import { Field, fmtDate, useToast } from '../ui/kit';
import { Notice } from './parts';
import { bankChangesAPI } from '../../lib/hr';

export default function BankChangeRequests({ onDecided }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [decide, setDecide] = useState(null);        // { req, kind, note }
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => bankChangesAPI.list('PENDING').then(setItems).catch(e => console.error(e)), []);
  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!decide || busy) return;
    if (decide.kind === 'reject' && !decide.note.trim()) { toast.error('Say why it is rejected'); return; }
    setBusy(true);
    try {
      if (decide.kind === 'approve') await bankChangesAPI.approve(decide.req.id, decide.note.trim());
      else await bankChangesAPI.reject(decide.req.id, decide.note.trim());
      toast.success(decide.kind === 'approve' ? 'Approved — the new details are on their record' : 'Rejected — they have been told why');
      setDecide(null);
      load();
      onDecided?.();
    } catch (e) { toast.error('Could not save the decision', e); }
    setBusy(false);
  }

  if (!items.length) return null;
  return (
    <section className="mac-card hr-card" aria-label="Bank detail changes waiting">
      <h2 className="section-title"><Banknote size={18} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />Bank detail changes waiting ({items.length})</h2>
      <Notice>Confirm a new account with the person directly — a call, not a chat message — before approving. Salary goes to the new details from the next payment.</Notice>
      <div className="att-req-list">
        {items.map(r => (
          <div key={r.id} className="mac-card hr-card att-req-card">
            <div>
              <h3 className="section-title" style={{ margin: 0 }}>{r.employeeName}</h3>
              <span className="faint">Asked {fmtDate(String(r.createdAt).slice(0, 10))}</span>
            </div>
            <dl className="kv">
              {r.bankDetails && <><dt>Bank now</dt><dd>{r.currentBankDetails || '—'}</dd><dt>Bank new</dt><dd><strong>{r.bankDetails}</strong></dd></>}
              {r.upiId && <><dt>UPI now</dt><dd>{r.currentUpiId || '—'}</dd><dt>UPI new</dt><dd><strong>{r.upiId}</strong></dd></>}
              <dt>Why</dt><dd>{r.reason}</dd>
            </dl>
            <div className="att-req-actions">
              <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setDecide({ req: r, kind: 'reject', note: '' })}>Reject</button>
              <button type="button" className="mac-btn mac-btn-primary" onClick={() => setDecide({ req: r, kind: 'approve', note: '' })}>Approve</button>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={!!decide} onClose={() => !busy && setDecide(null)}
        title={decide?.kind === 'approve' ? 'Approve new bank details' : 'Reject new bank details'} description={decide?.req.employeeName}
        footer={<>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setDecide(null)} disabled={busy}>Cancel</button>
          <button type="button" className={`mac-btn ${decide?.kind === 'reject' ? 'mac-btn-danger' : 'mac-btn-primary'}`} onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : decide?.kind === 'approve' ? 'Approve' : 'Reject'}
          </button>
        </>}>
        {decide && (
          <Field label={decide.kind === 'reject' ? 'Why (they will see this)' : 'Note (optional)'} required={decide.kind === 'reject'}>
            <textarea className="mac-input" rows={3} value={decide.note} onChange={e => setDecide(d => ({ ...d, note: e.target.value }))} autoFocus
              placeholder={decide.kind === 'approve' ? 'e.g. Confirmed on a call' : ''} />
          </Field>
        )}
      </Modal>
    </section>
  );
}
