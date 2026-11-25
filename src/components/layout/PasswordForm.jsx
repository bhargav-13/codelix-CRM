/* eslint-disable react-refresh/only-export-components */
// Change-password form, used by the forced "set your password" screen and by
// the Change password dialog (user menu / profile). It renders only the fields:
// give the <form> an id and put a <Button type="submit" form={id}> wherever the
// actions belong.
//   <PasswordForm id="pw" askCurrent onBusy={setBusy} onDone={close} />
import { useState } from 'react';
import { RiCheckLine, RiCheckboxBlankCircleLine, RiEyeLine, RiEyeOffLine } from '@remixicon/react';
import { useAuth } from '../../contexts/AuthContext';
import { Field } from '../ui/kit';
import { TextInput } from '../ui/Input';
import { IconButton } from '../ui/Button';
import Modal from '../ui/Modal';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';

// The rules enforced — the live checklist is built from the same list.
export const PASSWORD_RULES = [
  { key: 'len', label: 'At least 8 characters', test: pw => pw.length >= 8 },
  { key: 'letter', label: 'At least one letter', test: pw => /[A-Za-z]/.test(pw) },
  { key: 'digit', label: 'At least one number', test: pw => /\d/.test(pw) },
];

export function PasswordForm({ id, askCurrent = false, currentLabel = 'Current password', onBusy, onDone, autoFocus = true }) {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  // the server asked for the current password after all (e.g. the page was reloaded)
  const [needCurrent, setNeedCurrent] = useState(false);
  const withCurrent = askCurrent || needCurrent;
  const matches = pw2.length > 0 && pw === pw2;
  const clear = key => setErrors(x => (x[key] || x.form ? { ...x, [key]: undefined, form: undefined } : x));

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const next = {};
    if (withCurrent && !current) next.current = `Enter your ${currentLabel.toLowerCase()}.`;
    if (!PASSWORD_RULES.every(r => r.test(pw))) next.pw = 'This password does not meet all the rules below.';
    else if (withCurrent && current && pw === current) next.pw = 'Choose a password that is different from the current one.';
    if (!pw2) next.pw2 = 'Type the password again to confirm it.';
    else if (pw !== pw2) next.pw2 = 'The two passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true); onBusy?.(true);
    const { error } = await changePassword(pw, withCurrent ? current : undefined);
    setBusy(false); onBusy?.(false);
    if (!error) { onDone?.(); return; }
    const message = error.status === 0 ? 'Cannot reach the server. Check your connection and try again.'
      : error.message || 'Could not change the password. Please try again.';
    if (!withCurrent) { setNeedCurrent(true); setErrors({ form: message }); return; }
    // a rejected current password belongs next to that field
    if (/current|incorrect|wrong|invalid/i.test(message) && error.status !== 0) setErrors({ current: message });
    else setErrors({ form: message });
  }

  const type = show ? 'text' : 'password';
  const eye = (
    <IconButton size="small" icon={show ? RiEyeOffLine : RiEyeLine} label={show ? 'Hide passwords' : 'Show passwords'} aria-pressed={show} onClick={() => setShow(s => !s)} />
  );

  return (
    <form id={id} onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {errors.form && <div className="auth-alert" role="alert">{errors.form}</div>}

      {withCurrent && (
        <Field label={currentLabel} required error={errors.current}>
          {fid => <TextInput id={fid} type={type} autoComplete="current-password" autoFocus={autoFocus} hasError={!!errors.current}
            value={current} onChange={e => { setCurrent(e.target.value); clear('current'); }} />}
        </Field>
      )}

      <Field label="New password" required error={errors.pw}>
        {fid => <TextInput id={fid} type={type} autoComplete="new-password" autoFocus={autoFocus && !withCurrent} hasError={!!errors.pw} right={eye}
          value={pw} onChange={e => { setPw(e.target.value); clear('pw'); }} />}
      </Field>

      <ul aria-label="Password rules" style={{ listStyle: 'none', margin: '-6px 0 0', padding: 0, display: 'grid', gap: 4 }}>
        {[...PASSWORD_RULES.map(r => ({ key: r.key, label: r.label, ok: r.test(pw) })), { key: 'match', label: 'Both passwords match', ok: matches }].map(r => (
          <li key={r.key} aria-label={`${r.label}: ${r.ok ? 'met' : 'not met yet'}`}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, lineHeight: '18px', color: r.ok ? 'var(--good)' : 'var(--ink-2)', transition: 'color 150ms ease' }}>
            {r.ok ? <RiCheckLine size={16} aria-hidden="true" /> : <RiCheckboxBlankCircleLine size={16} aria-hidden="true" style={{ color: 'var(--ink-3)' }} />}
            <span>{r.label}</span>
          </li>
        ))}
      </ul>

      <Field label="Confirm new password" required error={errors.pw2}>
        {fid => <TextInput id={fid} type={type} autoComplete="new-password" hasError={!!errors.pw2}
          value={pw2} onChange={e => { setPw2(e.target.value); clear('pw2'); }} />}
      </Field>
    </form>
  );
}

// Voluntary change, from the user menu or the profile page.
export function ChangePasswordDialog({ isOpen, onClose }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Modal isOpen={isOpen} onClose={() => { if (!busy) onClose(); }} title="Change password" size="sm"
      description="Enter your current password, then choose a new one."
      footer={<>
        <Button variant="neutral" mode="stroke" size="small" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="submit" form="change-password-form" size="small" loading={busy} loadingText="Saving…">Change password</Button>
      </>}>
      <PasswordForm id="change-password-form" askCurrent onBusy={setBusy}
        onDone={() => { toast.success('Your password was changed'); onClose(); }} />
    </Modal>
  );
}
