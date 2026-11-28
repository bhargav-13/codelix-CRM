// Partner: work-from-home requests. Same shape as the correction requests next to it: count
// cards, a filter, and one card per request that is decided right there.
import { useState, useEffect, useCallback } from 'react';
import Badge from '../ui/Badge';
import Kpis from '../crm/Kpis';
import { useToast, SkeletonRows, EmptyPanel, ErrorPanel, Chips, Avatar, Field } from '../ui/kit';
import { wfhAPI, leaveMeta, fmtDayLong, todayIST, wfhSpan } from '../../lib/hr';
import { Check, CheckCircle2, Clock, Home, Hourglass, X } from 'lucide-react';

const FILTERS = [['PENDING', 'Waiting'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected'], ['ALL', 'All']];
const daysTo = (date, today) => Math.round((new Date(`${date}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);
const when = n => (n === 0 ? 'starts today' : n === 1 ? 'starts tomorrow' : n > 0 ? `starts in ${n} days` : n === -1 ? 'started yesterday' : `started ${-n} days ago`);

export default function WfhRequests({ onCount }) {
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
    try { const list = await wfhAPI.list(); setItems(list); onCount?.(list.filter(r => r.status === 'PENDING').length); }
    catch (e) { console.error(e); setError(e); }
  }, [onCount]);
  useEffect(() => { load(); }, [load]);

  async function submit(req) {
    if (!decide || busy) return;
    if (decide.kind === 'reject' && !decide.note.trim()) { setNoteError('Say why, so they can plan'); return; }
    setBusy(true);
    try {
      if (decide.kind === 'approve') await wfhAPI.approve(req.id, decide.note.trim());
      else await wfhAPI.reject(req.id, decide.note.trim());
      toast.success(decide.kind === 'approve' ? `Approved. ${req.employeeName} can punch from home ${wfhSpan(req)}.` : `Rejected. ${req.employeeName} has been told why.`);
      setDecide(null);
      load();
    } catch (e) { toast.error('Could not save the decision', e); }
    setBusy(false);
  }

  if (error && !items) return <ErrorPanel title="Could not load the requests" error={error} onRetry={load} />;
  if (!items) return <SkeletonRows rows={4} />;
  const count = s => items.filter(r => r.status === s).length;
  const shown = items.filter(r => filter === 'ALL' || r.status === filter);
  const homeToday = items.filter(r => r.status === 'APPROVED' && r.fromDate <= today && r.toDate >= today);
  return (
    <>
      <Kpis cols={3} items={[
        { label: 'Waiting for you', value: count('PENDING'), icon: Hourglass, tone: count('PENDING') ? 'warn' : 'good', active: filter === 'PENDING', sub: count('PENDING') ? 'Decide before the day comes' : 'Nothing to decide', onClick: () => setFilter('PENDING') },
        { label: 'At home today', value: homeToday.length, icon: Home, tone: 'brand', sub: homeToday.map(r => r.employeeName?.split(' ')[0]).join(', ') || 'Everyone is expected at the office' },
        { label: 'Approved', value: count('APPROVED'), icon: CheckCircle2, tone: 'good', active: filter === 'APPROVED', sub: `${count('REJECTED')} rejected`, onClick: () => setFilter('APPROVED') },
      ]} />

      <div className="hr-head-row">
        <Chips label="Show" value={filter} onChange={setFilter} options={FILTERS.map(([value, label]) => ({ value, label, count: value === 'ALL' ? items.length : count(value) }))} />
        <p className="hr-note" style={{ margin: 0 }}>On an approved day the employee can punch from the app from anywhere, and the day shows a WFH mark. The day still needs their punch in and punch out.</p>
      </div>

      {shown.length === 0 ? (
        <EmptyPanel icon={Home} title={filter === 'PENDING' ? 'Nothing waiting' : 'No requests here'} text={filter === 'PENDING' ? 'New work-from-home requests appear here.' : 'Try another filter.'} />
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
                    <p>{r.days} day{r.days === 1 ? '' : 's'} · {when(daysTo(r.fromDate, today))}</p>
                  </div>
                  <Badge color={m.color}>{m.label}</Badge>
                </header>

                <div className="req-times is-new">
                  <span className="req-times-label">Work from home</span>
                  <div className="req-times-row">
                    <span><small>{r.fromDate === r.toDate ? 'Day' : 'From'}</small><b>{fmtDayLong(r.fromDate)}</b></span>
                    {r.fromDate !== r.toDate && <span><small>To</small><b>{fmtDayLong(r.toDate)}</b></span>}
                  </div>
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
                        placeholder={decide.kind === 'reject' ? 'e.g. Client is visiting the office that day' : 'e.g. Please be on the 11 am call'} />
                    </Field>
                    <footer className="req-actions">
                      <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setDecide(null)} disabled={busy}>Back</button>
                      <button type="button" className={`mac-btn ${decide.kind === 'reject' ? 'mac-btn-danger' : 'mac-btn-primary'}`} onClick={() => submit(r)} disabled={busy}>
                        {busy ? 'Saving…' : decide.kind === 'approve' ? 'Approve work from home' : 'Reject the request'}
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
