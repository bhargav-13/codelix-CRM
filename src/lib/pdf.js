// Turns the page elements on screen into one PDF file, one element per sheet.
// By default each page is drawn at twice its size (sharp when zoomed or printed) on an A4 sheet;
// `size` ([width, height] in mm) and `scale` change that for pages of another shape or size.
// The two libraries are loaded only when a PDF is actually made.
export async function pagesToPdf(nodes, onProgress, { size = [210, 297], scale = 2 } = {}) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);
  if (document.fonts?.ready) await document.fonts.ready;
  const [w, h] = size;
  const pdf = new jsPDF({ unit: 'mm', format: [w, h], orientation: 'portrait', compress: true });
  for (let i = 0; i < nodes.length; i++) {
    onProgress?.(i + 1, nodes.length);
    const canvas = await html2canvas(nodes[i], { scale, useCORS: true, backgroundColor: '#ffffff', logging: false });
    if (i) pdf.addPage([w, h], 'portrait');
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, w, h, undefined, 'FAST');
  }
  return pdf.output('blob');
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
