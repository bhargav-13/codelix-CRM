import Modal from './Modal';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({ isOpen, onClose, onConfirm, title = 'Are you sure?', message, confirmLabel = 'Delete', danger = true }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div style={{ display:'flex', gap:12, marginBottom:22 }}>
        <div style={{ width:36, height:36, borderRadius:'50%', flexShrink:0, background: danger?'rgba(255,59,48,0.1)':'rgba(0,113,227,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <AlertTriangle size={17} color={danger?'#FF3B30':'#0071E3'} />
        </div>
        <p style={{ fontSize:13.5, color:'#3C3C43', lineHeight:1.55, paddingTop:6 }}>{message}</p>
      </div>
      <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
        <button onClick={onClose} className="mac-btn mac-btn-secondary" style={{ fontSize:13 }}>Cancel</button>
        <button
          onClick={() => { onConfirm(); onClose(); }}
          className={`mac-btn ${danger ? 'mac-btn-danger' : 'mac-btn-primary'}`}
          style={{ fontSize:13 }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
