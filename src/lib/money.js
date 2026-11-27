// How rupee amounts are written across the app.
// Below one crore: the full figure with Indian commas (₹12,50,000).
// One crore and above: in crore with up to two decimals (₹2.36 Cr.), because eight-digit figures
// are hard to read at a glance. Forms and exports keep the exact number; this is display only.
export const CRORE = 1e7;

// A plain positive number of rupees → text, without sign or symbol handling by the caller.
export function rupees(amount, { paise = true } = {}) {
  const v = Math.abs(Number(amount) || 0);
  if (v >= CRORE) {
    const cr = Math.round((v / CRORE) * 100) / 100;
    return `₹${cr.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr.`;
  }
  const whole = !paise || Math.abs(v - Math.round(v)) < 0.005;
  return '₹' + (whole ? Math.round(v) : v).toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
}

// With the minus sign in front when the amount is negative
export const inr = (amount, options) => ((Number(amount) || 0) < 0 ? '−' : '') + rupees(amount, options);
