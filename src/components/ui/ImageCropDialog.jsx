/* eslint-disable react-refresh/only-export-components */
// Square photo cropper for profile pictures. Everything happens in the browser:
// the chosen image is positioned (drag, wheel, slider or arrow keys), then drawn
// to a canvas no larger than `maxSize` and handed back as a JPEG file.
//   <ImageCropDialog file={picked} onCancel={…} onConfirm={async file => upload(file)} />
// `onConfirm` may return a promise — the button shows a spinner until it settles,
// and a rejection is shown in the dialog.
import { useCallback, useEffect, useRef, useState } from 'react';
import { RiZoomInLine, RiZoomOutLine } from '@remixicon/react';
import Modal from './Modal';
import { Button } from './Button';

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_ZOOM = 4;

// Why a picked file cannot be used, or '' when it is fine.
export function imageProblem(file) {
  if (!file) return 'Choose a photo.';
  if (!IMAGE_TYPES.includes(file.type)) return 'Choose a JPG, PNG or WebP image.';
  if (file.size > MAX_SOURCE_BYTES) return 'That image is over 15 MB. Choose a smaller one.';
  return '';
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export default function ImageCropDialog({ file, onCancel, onConfirm, maxSize = 512, title = 'Position your photo' }) {
  const [src, setSrc] = useState(null);
  const [natural, setNatural] = useState(null);       // { w, h } of the source image
  const [stage, setStage] = useState(0);              // on-screen size of the square, px
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });     // image offset from centre, stage px
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const imgRef = useRef(null);
  const stageRef = useRef(null);
  const drag = useRef(null);

  // a fresh object URL per picked file
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // start over for each picked file (the URL only exists inside this effect)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSrc(url); setNatural(null); setZoom(1); setPos({ x: 0, y: 0 }); setFailure(''); setBusy(false);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // the stage is responsive — track its real size
  const stageNode = useCallback(node => {
    stageRef.current = node;
    if (!node) return;
    setStage(node.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setStage(node.clientWidth));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const base = natural && stage ? stage / Math.min(natural.w, natural.h) : 1;   // scale at which the image just covers the square
  const scale = base * zoom;
  const shown = natural ? { w: natural.w * scale, h: natural.h * scale } : { w: 0, h: 0 };
  // keep the square covered: the image can only move as far as its overhang
  const limit = useCallback((p, z = zoom) => {
    if (!natural || !stage) return { x: 0, y: 0 };
    const s = (stage / Math.min(natural.w, natural.h)) * z;
    const mx = Math.max(0, (natural.w * s - stage) / 2), my = Math.max(0, (natural.h * s - stage) / 2);
    return { x: clamp(p.x, -mx, mx), y: clamp(p.y, -my, my) };
  }, [natural, stage, zoom]);
  const view = limit(pos);

  const applyZoom = z => { const next = clamp(z, 1, MAX_ZOOM); setZoom(next); setPos(p => limit(p, next)); };

  function onPointerDown(e) {
    if (!natural || busy) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: view };
  }
  function onPointerMove(e) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setPos(limit({ x: d.from.x + (e.clientX - d.x), y: d.from.y + (e.clientY - d.y) }));
  }
  const endDrag = () => { drag.current = null; };

  function onKeyDown(e) {
    const step = e.shiftKey ? 24 : 8;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) { e.preventDefault(); setPos(p => limit({ x: limit(p).x + moves[e.key][0], y: limit(p).y + moves[e.key][1] })); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); applyZoom(zoom + 0.1); }
    else if (e.key === '-') { e.preventDefault(); applyZoom(zoom - 0.1); }
  }

  async function confirm() {
    if (busy || !natural || !imgRef.current) return;
    setFailure('');
    setBusy(true);
    try {
      // the visible square, in source-image pixels
      const side = stage / scale;
      const sx = clamp(natural.w / 2 - view.x / scale - side / 2, 0, natural.w - side);
      const sy = clamp(natural.h / 2 - view.y / scale - side / 2, 0, natural.h - side);
      const out = Math.max(1, Math.round(Math.min(maxSize, side)));
      const canvas = document.createElement('canvas');
      canvas.width = out; canvas.height = out;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';                     // JPEG has no transparency
      ctx.fillRect(0, 0, out, out);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(imgRef.current, sx, sy, side, side, 0, 0, out, out);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('This image could not be processed. Try another one.');
      await onConfirm?.(new File([blob], 'profile-photo.jpg', { type: 'image/jpeg' }));
    } catch (e) {
      setFailure(e?.message || 'The photo could not be saved. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal isOpen={!!file} onClose={() => { if (!busy) onCancel?.(); }} title={title} size="sm"
      description="Drag to move, scroll or use the slider to zoom. The photo is shown as a circle."
      footer={<>
        <Button variant="neutral" mode="stroke" size="small" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button size="small" onClick={confirm} loading={busy} loadingText="Saving…" disabled={!natural && !busy}>Save photo</Button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div ref={stageNode} className="crop-stage" tabIndex={0} role="group"
          aria-label="Photo position. Use the arrow keys to move and plus or minus to zoom."
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
          onWheel={e => applyZoom(zoom - e.deltaY * 0.0015)} onKeyDown={onKeyDown}>
          {src && (
            <img ref={imgRef} src={src} alt="" draggable={false}
              onLoad={e => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              onError={() => setFailure('This image could not be opened. Choose a JPG, PNG or WebP file.')}
              style={{ width: shown.w || '100%', height: shown.h || 'auto', transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px))`, opacity: natural ? 1 : 0, transition: 'opacity 200ms ease' }} />
          )}
          <div className="crop-mask" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-3)' }}>
          <RiZoomOutLine size={18} aria-hidden="true" />
          <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} disabled={!natural || busy}
            onChange={e => applyZoom(+e.target.value)} aria-label="Zoom" style={{ flex: 1, accentColor: 'var(--accent)' }} />
          <RiZoomInLine size={18} aria-hidden="true" />
        </div>

        {failure && <div className="auth-alert" role="alert">{failure}</div>}
      </div>
    </Modal>
  );
}
