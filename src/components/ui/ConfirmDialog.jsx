import { useRef, useState } from 'react';
import { RiAlertLine, RiQuestionLine } from '@remixicon/react';
import Modal from './Modal';
import { Button } from './Button';

// Confirmation for destructive (or otherwise important) actions.
// `onConfirm` may be sync or async:
//   • sync            → runs, dialog closes
//   • returns Promise → the button shows a spinner and the dialog stays open until it
//                       settles; if it rejects the dialog stays open and shows why.
export default function ConfirmDialog({ isOpen, onClose, onConfirm, title = 'Are you sure?', message, confirmLabel = 'Delete', danger = true }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);

  function close() {
    if (busy) return;
    setFailure('');
    onClose?.();
  }

  async function confirm() {
    if (busy) return;
    setFailure('');
    let result;
    try { result = onConfirm?.(); }
    catch (e) { setFailure(e?.message || 'Something went wrong.'); return; }
    if (!result || typeof result.then !== 'function') { onClose?.(); return; }
    setBusy(true);
    try {
      await result;
      setBusy(false);
      onClose?.();
    } catch (e) {
      setBusy(false);
      setFailure(e?.message || 'Something went wrong. Please try again.');
    }
  }

  const Icon = danger ? RiAlertLine : RiQuestionLine;
  return (
    // Dangerous actions start on Cancel so a stray Enter cannot destroy anything.
    <Modal isOpen={isOpen} onClose={close} title={title} size="sm" initialFocus={danger ? cancelRef : confirmRef}
      footer={<>
        <Button ref={cancelRef} variant="neutral" mode="stroke" size="small" onClick={close} disabled={busy}>Cancel</Button>
        <Button ref={confirmRef} variant={danger ? 'error' : 'primary'} size="small" onClick={confirm} loading={busy} loadingText="Working…">{confirmLabel}</Button>
      </>}>
      <div style={{ display: 'flex', gap: 14 }}>
        <span className="empty-icon" style={{ flexShrink: 0, width: 40, height: 40, borderRadius: '50%', margin: 0, boxShadow: 'none', background: danger ? 'var(--bad-soft)' : 'var(--brand-soft)', color: danger ? 'var(--bad)' : 'var(--brand)' }}>
          <Icon size={20} />
        </span>
        <div style={{ minWidth: 0, paddingTop: 8 }}>
          <p style={{ fontSize: 'var(--fs-md)', color: 'var(--ink-2)', lineHeight: 1.55 }}>{message}</p>
          {failure && <p className="field-error" role="alert" style={{ marginTop: 8 }}>{failure}</p>}
        </div>
      </div>
    </Modal>
  );
}
