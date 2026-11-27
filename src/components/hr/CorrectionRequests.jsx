// Partner: correction requests from employees. Each card shows what is recorded next to what was
// asked for, and the decision is made right on the card (no popup): Approve, or Reject with a reason.
import { useState, useEffect, useCallback } from 'react';
import Badge from '../ui/Badge';
import Kpis from '../crm/Kpis';
import { useToast, SkeletonRows, EmptyPanel, ErrorPanel, Chips, Avatar, Field } from '../ui/kit';
import { correctionsAPI, leaveMeta, fmtTime, fmtDayLong, todayIST } from '../../lib/hr';
import { ArrowRight, Check, CheckCircle2, Clock, Hourglass, X, XCircle } from 'lucide-react';

const FILTERS = [['PENDING', 'Waiting'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected'], ['ALL', 'All']];
const daysAgo = (date, today) => Math.round((new Date(`${today}T00:00:00`) - new Date(`${date}T00:00:00`)) / 86400000);
const ago = n => (n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`);

function Times({ label, a, b, empty, tone }) {
  return (
    <div className={`req-times ${tone || ''}`}>
      <span className="req-times-label">{label}</span>
      {a || b ? (
        <div className="req-times-row">
          <span><small>In</small><b>{a || '—'}</b></span>
          <span><small>Out</small><b>{b || '—'}</b></span>
        </div>
      ) : <span className="req-times-empty">{empty}</span>}
    </div>
  );
}

export default function CorrectionRequests({ onCount }) {
  const toast = useToast();
  const [today] = useState(todayIST);
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('PENDING');
  const [decide, setDecide] = useState(null);       // { id, kind: 'approve' | 'reject', note }
  const [noteError, setNoteError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try { const list = await correctionsAPI.list(); setItems(list); onCount?.(list.filter(r => r.status === 'PENDING').length); }
    catch (e) { console.error(e); setError(e); }
  }, [onCount]);
  useEffect(() => { load(); }, [load]);

  async function submit(req) {
    if (!decide || busy) return;
    if (decide.kind === 'reject' && !decide.note.trim()) { setNoteError('Say why, so they know what to fix'); return; }
    setBusy(true);
    try {
      if (decide.kind === 'approve') await correctionsAPI.approve(req.id, decide.note.trim());
      else await correctionsAPI.reject(req.id, decide.note.trim());
      toast.success(decide.kind === 'approve' ? `Approved. ${req.employeeName}'s day is corrected.` : `Rejected. ${req.employeeName} has been told why.`);
      setDecide(null);
      load();
    } catch (e) { toast.error('Could not save the decision', e); }
    setBusy(false);
  }

  if (error && !items) return <ErrorPanel title="Could not load the requests" error={error} onRetry={load} />;
  if (!items) return <SkeletonRows rows={4} />;
  const count = s => items.filter(r => r.status === s).length;
  const shown = items.filter(r => filter === 'ALL' || r.status === filter);
  const oldest = items.filter(r => r.status === 'PENDING').map(r => r.createdAt || r.date).sort()[0];
  return (
    <>
      <Kpis cols={3} items={[
        { label: 'Waiting for you', value: count('PENDING'), icon: Hourglass, tone: count('PENDING') ? 'warn' : 'good', active: filter === 'PENDING',
          sub: count('PENDING') ? `Oldest asked ${ago(daysAgo(String(oldest).slice(0, 10), today))}` : 'Nothing to decide', onClick: () => setFilter('PENDING') },
        { label: 'Approved', value: count('APPROVED'), icon: CheckCircle2, tone: 'good', active: filter === 'APPROVED', sub: 'The day was corrected', onClick: () => setFilter('APPROVED') },
        { label: 'Rejected', value: count('REJECTED'), icon: XCircle, tone: 'bad', active: filter === 'REJECTED', sub: 'Left as recorded', onClick: () => setFilter('REJECTED') },
      ]} />

      <div className="hr-head-row">
        <Chips label="Show" value={filter} onChange={setFilter} options={FILTERS.map(([value, label]) => ({ value, label, count: value === 'ALL' ? items.length : count(value) }))} />
        <p className="hr-note" style={{ margin: 0 }}>An employee asks here when a punch is missing or wrong. Approving writes a correction for that day; the original punches stay underneath.</p>
      </div>

      {shown.length === 0 ? (
        <EmptyPanel icon={CheckCircle2} title={filter === 'PENDING' ? 'Nothing waiting' : 'No requests here'} text={filter === 'PENDING' ? 'New correction requests from employees appear here.' : 'Try another filter.'} />
      ) : (
        <div className="req-list">
          {shown.map(r => {
            const m = leaveMeta(r.status);
            const open = decide?.id === r.id;
            return (
              <article key={r.id} className={`mac-card req-card is-${String(r.status).toLowerCase()}`}>
                <header className="req-head">
                  <Avatar name={r.employeeName} size={40} />
                  <div className="req-title">
                    <h3>{r.employeeName}</h3>
                    <p>{fmtDayLong(r.date)} · {ago(daysAgo(r.date, today))}</p>
                  </div>
                  <Badge color={m.color}>{m.label}</Badge>
                </header>

                <div className="req-compare">
                  <Times label="Recorded now" a={r.recordedIn ? fmtTime(r.recordedIn) : ''} b={r.recordedOut ? fmtTime(r.recordedOut) : ''} empty="Nothing recorded" />
                  <ArrowRight size={18} aria-hidden="true" className="req-arrow" />
                  <Times label="Asked for" tone="is-new" a={r.punchIn || (r.recordedIn ? 'Keep' : '')} b={r.punchOut || (r.recordedOut || r.punchIn ? 'Keep' : '')} empty="No times given" />
                </div>

                <blockquote className="req-reason">{r.reason}</blockquote>

                {r.decisionNote && <p className="req-decision"><Clock size={14} aria-hidden="true" /> {r.status === 'REJECTED' ? 'Rejected: ' : 'Note: '}{r.decisionNote}{r.decidedBy ? ` (${r.decidedBy})` : ''}</p>}

                {r.status === 'PENDING' && !open && (
                  <footer className="req-actions">
                    <button type="button" className="mac-btn mac-btn-secondary" onClick={() => { setDecide({ id: r.id, kind: 'reject', note: '' }); setNoteError(''); }}><X size={15} /> Reject</button>
                    <button type="button" className="mac-btn mac-btn-primary" onClick={() => { setDecide({ id: r.id, kind: 'approve', note: '' }); setNoteError(''); }}><Check size={15} /> Approve</button>
                  </footer>
                )}
                {open && (
                  <div className={`req-decide is-${decide.kind}`}>
                    <Field label={decide.kind === 'reject' ? 'Why is it rejected? (they will see this)' : 'Note for them (optional)'} required={decide.kind === 'reject'} error={noteError}>
                      <textarea className="mac-input" rows={2} autoFocus value={decide.note} onChange={e => { setDecide(d => ({ ...d, note: e.target.value })); setNoteError(''); }}
                        placeholder={decide.kind === 'reject' ? 'e.g. The door camera shows you left at 5 pm' : 'e.g. Please punch out before leaving next time'} />
                    </Field>
                    <footer className="req-actions">
                      <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setDecide(null)} disabled={busy}>Back</button>
                      <button type="button" className={`mac-btn ${decide.kind === 'reject' ? 'mac-btn-danger' : 'mac-btn-primary'}`} onClick={() => submit(r)} disabled={busy}>
                        {busy ? 'Saving…' : decide.kind === 'approve' ? 'Approve and correct the day' : 'Reject the request'}
                      </button>
                    </footer>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
