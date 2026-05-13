export function fmtInput(val) {
  const str = String(val ?? '').replace(/,/g, '');
  if (!str) return '';
  const [int, dec] = str.split('.');
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec !== undefined ? `${formatted}.${dec}` : formatted;
}

export function NumInput({ value, onChange, placeholder, className, style }) {
  return (
    <input
      className={className}
      style={style}
      type="text"
      inputMode="numeric"
      value={fmtInput(value)}
      placeholder={placeholder}
      onWheel={e => e.target.blur()}
      onChange={e => onChange(e.target.value.replace(/,/g, '').replace(/[^0-9.]/g, ''))}
    />
  );
}
