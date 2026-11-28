// "Send by email" for a proposal or letter: choose the company address it goes from (info,
// transaction, no-reply…) every time, who it goes to, the subject and message; the PDF is attached.
import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { Field, useToast } from '../ui/kit';
import { AutoArea, Toggle } from './FormBits';
import { mailAPI, blobToBase64, DEFAULT_SENDER } from '../../lib/mail';
import { Send, Mail, Paperclip, Info } from 'lucide-react';
import './SendEmail.css';

const LAST = kind => `codelix.mail.from.${kind}`;
const NOTES = {
  'no-reply': 'Replies go to info@.',
  transaction: 'For payments, receipts and invoices.',
  info: 'Replies come back to this inbox.',
};

export default function SendEmail({ isOpen, onClose, kind, defaults, fileName, makePdf, onSaveCopy }) {
  const toast = useToast();
  const [cfg, setCfg] = useState(null);          // what the server says: mode and senders
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [attach, setAttach] = useState(true);
  const [saveCopy, setSaveCopy] = useState(true);
  const [sending, setSending] = useState('');
  const [error, setError] = useState('');

  // Fresh every time it opens: the document may have changed since.
  useEffect(() => {
    if (!isOpen) return;
    setTo(defaults?.to || ''); setCc(''); setSubject(defaults?.subject || ''); setMessage(defaults?.message || '');
    setAttach(true); setSaveCopy(!!onSaveCopy); setError(''); setSending('');
    mailAPI.senders().then(c => {
      setCfg(c);
      let last = '';
      try { last = localStorage.getItem(LAST(kind)) || ''; } catch { /* fine */ }
      const keys = (c.senders || []).map(s => s.key);
      setFrom([last, DEFAULT_SENDER[kind], keys[0]].find(k => k && keys.includes(k)) || '');
    }).catch(e => { setCfg({ mode: 'error', senders: [] }); setError(e?.message || 'The sender list could not be loaded.'); });
  }, [isOpen, kind, defaults, onSaveCopy]);

  async function send() {
    if (sending) return;
    const toList = to.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
    if (!from) { setError('Choose who it is from.'); return; }
    if (!toList.length) { setError('Add the email address it goes to.'); return; }
    if (!subject.trim()) { setError('Add a subject.'); return; }
    setError('');
    try {
      let attachmentBase64, blob;
      if (attach) {
        setSending('Making the PDF…');
        blob = await makePdf();
        attachmentBase64 = await blobToBase64(blob);
      }
      setSending('Sending…');
      const r = await mailAPI.send({
        from, to: toList, cc: cc.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean),
        subject: subject.trim(), message, attachmentName: attach ? fileName : undefined, attachmentBase64,
      });
      try { localStorage.setItem(LAST(kind), from); } catch { /* fine */ }
      if (saveCopy && onSaveCopy && blob) await onSaveCopy(blob).catch(e => toast.error('Sent, but the copy was not saved to Client documents', e));
      toast.success(r.mode === 'outbox' ? `Written to the test inbox (not sent) from ${r.from}` : `Sent to ${r.to.join(', ')} from ${r.from}`);
      onClose();
    } catch (e) {
      setError(e?.message || 'The mail was not sent.');
    } finally {
      setSending('');
    }
  }

  const off = cfg?.mode === 'off';
  return (
    <Modal isOpen={isOpen} onClose={sending ? () => {} : onClose} title="Send by email" size="md"
      footer={<>
        <button type="button" className="mac-btn mac-btn-secondary" onClick={onClose} disabled={!!sending}>Cancel</button>
        <button type="button" className="mac-btn mac-btn-primary" onClick={send} disabled={!!sending || !cfg || off || !cfg.senders?.length}>
          <Send size={15} /> {sending || 'Send'}
        </button>
      </>}>
      <div className="se">
        <div>
          <span className="field-label">From</span>
          {!cfg ? <p className="se-note">Loading the company addresses…</p> : (
            <div className="se-from" role="radiogroup" aria-label="Send from">
              {(cfg.senders || []).map(s => (
                <button key={s.key} type="button" role="radio" aria-checked={from === s.key} className={`se-sender ${from === s.key ? 'on' : ''}`} onClick={() => setFrom(s.key)}>
                  <Mail size={15} aria-hidden="true" />
                  <span><b>{s.name}</b><em>{s.address}</em><small>{NOTES[s.key] || ''}</small></span>
                </button>
              ))}
            </div>
          )}
          {off && <p className="se-note warn"><Info size={13} /> Email is not set up on the server yet (MAIL_HOST).</p>}
          {cfg?.mode === 'outbox' && <p className="se-note"><Info size={13} /> This server writes mail to a test folder instead of sending it.</p>}
        </div>
        <Field label="To" hint="One or more addresses, separated by commas.">
          {id => <input id={id} className="mac-input" type="text" inputMode="email" value={to} onChange={e => setTo(e.target.value)} placeholder="client@example.com" />}
        </Field>
        <Field label="Cc (optional)">{id => <input id={id} className="mac-input" type="text" inputMode="email" value={cc} onChange={e => setCc(e.target.value)} />}</Field>
        <Field label="Subject">{id => <input id={id} className="mac-input" value={subject} onChange={e => setSubject(e.target.value)} maxLength={200} />}</Field>
        <Field label="Message">{id => <AutoArea id={id} rows={5} value={message} onChange={e => setMessage(e.target.value)} />}</Field>
        <Toggle checked={attach} onChange={setAttach}><Paperclip size={13} aria-hidden="true" /> Attach the PDF ({fileName})</Toggle>
        {onSaveCopy && attach && <Toggle checked={saveCopy} onChange={setSaveCopy}>Also save the PDF under the client in Client documents</Toggle>}
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
