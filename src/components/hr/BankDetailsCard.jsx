// The employee's own salary bank details on My profile. They can see them (masked
// until they choose to show them) and ask for a change; the HR record only
// changes when a partner approves, so nobody can quietly redirect a salary.
import { useCallback, useEffect, useState } from 'react';
import { RiBankLine, RiEyeLine, RiEyeOffLine } from '@remixicon/react';
import { ProfileCard, InfoList } from '../layout/ProfileParts';
import { Button } from '../ui/Button';
import Badge from '../ui/Badge';
import Modal from '../ui/Modal';
import ConfirmDialog from '../ui/ConfirmDialog';
import { Field, fmtDate, useToast } from '../ui/kit';
import { http } from '../../lib/http';
import { bankChangesAPI, leaveMeta } from '../../lib/hr';

const mask = v => (!v ? 'Not on file' : v.length <= 4 ? '••••' : `•••• ${v.slice(-4)}`);
const UPI = /^[A-Za-z0-9._-]{2,}@[A-Za-z][A-Za-z0-9.-]{1,}$/;

export default function BankDetailsCard() {
  const toast = useToast();
  const [record, setRecord] = useState(null);
  const [requests, setRequests] = useState([]);
  const [reveal, setReveal] = useState(false);
  const [form, setForm] = useState(null);            // { upiId, bankDetails, reason }
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [withdraw, setWithdraw] = useState(null);

  const load = useCallback(async () => {
    try { setRecord(await http.get('/employees/me')); } catch (e) { console.error(e); }
    try { setRequests(await bankChangesAPI.mine()); } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = requests.find(r => r.status === 'PENDING');
  const last = requests.find(r => r.status !== 'PENDING' && r.status !== 'CANCELLED');

  async function send() {
    if (busy || !form) return;
    const er = {};
    const upi = form.upiId.trim(), bank = form.bankDetails.trim();
    if (!upi && !bank) er.upiId = 'Enter the new UPI ID, the new bank details, or both';
    if (upi && !UPI.test(upi)) er.upiId = 'A UPI ID looks like name@bank';
    if (!form.reason.trim()) er.reason = 'Say why the details are changing';
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      await bankChangesAPI.create({ upiId: upi, bankDetails: bank, reason: form.reason.trim() });
      toast.success('Sent — a partner will check it before your salary account changes');
      setForm(null);
      load();
    } catch (e) { toast.error('Could not send the request', e); }
    setBusy(false);
  }

  async function cancel(id) {
    try { await bankChangesAPI.cancel(id); toast.success('Request withdrawn'); load(); }
    catch (e) { toast.error('Could not withdraw the request', e); }
    setWithdraw(null);
  }

  return (
    <ProfileCard icon={RiBankLine} title="Salary bank details" sub="Where your salary is paid. Changes need a partner's approval.">
      <InfoList rows={[
        { icon: RiBankLine, label: 'Bank account', value: record ? (reveal ? record.bankDetails || 'Not on file' : mask(record.bankDetails)) : '…' },
        { icon: RiBankLine, label: 'UPI ID', value: record ? (reveal ? record.upiId || 'Not on file' : mask(record.upiId)) : '…' },
      ]} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {record && (record.bankDetails || record.upiId) && (
          <Button variant="neutral" mode="ghost" size="small" leftIcon={reveal ? RiEyeOffLine : RiEyeLine} onClick={() => setReveal(v => !v)}>{reveal ? 'Hide' : 'Show'}</Button>
        )}
        {!open && <Button variant="neutral" mode="stroke" size="small" onClick={() => { setErrors({}); setForm({ upiId: '', bankDetails: '', reason: '' }); }}>Request a change</Button>}
      </div>
      {open && (
        <div className="hr-note" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Badge color="orange">Waiting for a partner</Badge>
          <span>Sent {fmtDate(String(open.createdAt).slice(0, 10))}</span>
          <Button variant="neutral" mode="ghost" size="xsmall" onClick={() => setWithdraw(open.id)}>Withdraw</Button>
        </div>
      )}
      {!open && last && (
        <p className="hr-note" style={{ margin: 0 }}>
          Last request: <Badge color={leaveMeta(last.status).color}>{leaveMeta(last.status).label}</Badge>
          {last.decisionNote ? ` — ${last.decisionNote}` : ''}
        </p>
      )}

      <Modal isOpen={!!form} onClose={() => !busy && setForm(null)} title="Change salary bank details"
        footer={<>
          <button type="button" className="mac-btn mac-btn-secondary" onClick={() => setForm(null)} disabled={busy}>Cancel</button>
          <button type="submit" form="bank-change-form" className="mac-btn mac-btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send to partners'}</button>
        </>}>
        {form && (
          <form id="bank-change-form" onSubmit={e => { e.preventDefault(); send(); }} noValidate>
            <p className="hr-note" style={{ marginTop: 0 }}>Fill in only what is changing. A partner confirms it with you before any salary goes to the new account.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="New UPI ID" error={errors.upiId}>
                <input className="mac-input" value={form.upiId} maxLength={100} autoComplete="off" placeholder="name@bank"
                  onChange={e => setForm(f => ({ ...f, upiId: e.target.value }))} />
              </Field>
              <Field label="New bank details">
                <input className="mac-input" value={form.bankDetails} maxLength={300} autoComplete="off" placeholder="Account number, IFSC, bank name"
                  onChange={e => setForm(f => ({ ...f, bankDetails: e.target.value }))} />
              </Field>
              <Field label="Why" required error={errors.reason}>
                <textarea className="mac-input" rows={2} maxLength={500} value={form.reason} placeholder="e.g. Moved my salary account to HDFC"
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
              </Field>
            </div>
          </form>
        )}
      </Modal>
      <ConfirmDialog isOpen={!!withdraw} onClose={() => setWithdraw(null)} onConfirm={() => cancel(withdraw)}
        title="Withdraw this request?" confirmLabel="Withdraw" message="Your bank details stay as they are." />
    </ProfileCard>
  );
}
