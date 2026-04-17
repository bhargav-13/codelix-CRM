import { X } from 'lucide-react';
import { useEffect } from 'react';

const SIZES = { sm:'440px', md:'560px', lg:'680px', xl:'860px', full:'1060px' };

export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: SIZES[size] || SIZES.md }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 22px 16px', borderBottom:'1px solid rgba(0,0,0,0.07)' }}>
          <h2 style={{ fontSize:15.5, fontWeight:660, color:'#1D1D1F', letterSpacing:'-0.3px' }}>{title}</h2>
          <button
            onClick={onClose}
            style={{ width:28, height:28, borderRadius:'50%', background:'rgba(0,0,0,0.06)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.12s' }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(0,0,0,0.1)'}
            onMouseLeave={e=>e.currentTarget.style.background='rgba(0,0,0,0.06)'}
          >
            <X size={14} color="#48484A" />
          </button>
        </div>
        {/* Body */}
        <div style={{ padding:'20px 22px' }}>{children}</div>
      </div>
    </div>
  );
}
