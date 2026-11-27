// Turns the A4 page elements on screen into one PDF file.
// Each page is drawn at twice its size (sharp when zoomed or printed) and placed on its own A4 sheet.
// The two libraries are loaded only when a PDF is actually made.
export async function pagesToPdf(nodes, onProgress) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);
  if (document.fonts?.ready) await document.fonts.ready;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  for (let i = 0; i < nodes.length; i++) {
    onProgress?.(i + 1, nodes.length);
    const canvas = await html2canvas(nodes[i], { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
    if (i) pdf.addPage();
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
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
