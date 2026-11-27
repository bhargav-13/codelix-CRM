/* eslint-disable react-refresh/only-export-components */
// Status pill. Colours come from the design tokens.
//   <Badge color="green">Active</Badge>            soft background + coloured text (default)
//   <Badge color="blue" variant="filled">New</Badge>
//   <Badge color="orange" variant="stroke" dot>Pending</Badge>
const TONES = {
  neutral: { fg: 'var(--ink-2)', soft: 'var(--surface-2)', solid: 'var(--color-neutral-600)', line: 'var(--line-strong)' },
  brand:   { fg: 'var(--brand)', soft: 'var(--brand-soft)', solid: 'var(--accent)', line: 'var(--color-primary-alpha-24)' },
  good:    { fg: 'var(--good)', soft: 'var(--good-soft)', solid: 'var(--color-green-800)', line: 'var(--color-green-alpha-24)' },
  bad:     { fg: 'var(--bad)', soft: 'var(--bad-soft)', solid: 'var(--color-red-700)', line: 'var(--color-red-alpha-24)' },
  warn:    { fg: 'var(--warn)', soft: 'var(--warn-soft)', solid: 'var(--color-orange-800)', line: 'var(--color-orange-alpha-24)' },
  feature: { fg: 'var(--color-feature-dark)', soft: 'var(--color-purple-alpha-10)', solid: 'var(--color-purple-600)', line: 'var(--color-purple-alpha-24)' },
};

// Every colour name existing callers pass, mapped to a tone.
const COLOR_TONE = {
  gray: 'neutral', blue: 'brand', green: 'good', red: 'bad', orange: 'warn', yellow: 'warn', purple: 'feature',
  hot: 'bad', warm: 'warn', cold: 'brand', won: 'good', lost: 'neutral',
  high: 'bad', medium: 'warn', low: 'neutral',
  active: 'good', inactive: 'neutral', left: 'neutral',
  inprogress: 'brand', completed: 'good', pending: 'warn', onhold: 'warn', cancelled: 'neutral',
  credit: 'good', debit: 'bad', partial: 'warn',
  fulltime: 'brand', parttime: 'brand', freelancer: 'warn', intern: 'neutral',
};

export default function Badge({ children, color = 'gray', variant = 'light', dot = false, icon: Icon, className = '', style, ...rest }) {
  const t = TONES[COLOR_TONE[color]] || TONES[color] || TONES.neutral;
  const look = variant === 'filled' ? { background: t.solid, color: '#fff' }
    : variant === 'stroke' ? { background: 'transparent', color: t.fg, boxShadow: `inset 0 0 0 1px ${t.line}` }
    : { background: t.soft, color: t.fg };
  return (
    <span className={`badge ${className}`} style={{ ...look, ...style }} {...rest}>
      {dot && <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />}
      {Icon && <Icon size={13} aria-hidden="true" />}
      {children}
    </span>
  );
}
export { Badge };

export function getStatusColor(status) {
  const map = {
    'Hot':'hot','Warm':'warm','Cold':'cold',
    'Closed Won':'won','Closed Lost':'lost','Won':'won','Lost':'lost','Draft':'blue',
    'Connected':'green','No response':'red','Meeting done':'blue','Proposal sent':'purple','Call back later':'orange',
    'High':'high','Medium':'medium','Low':'low',
    'Active':'active','Inactive':'inactive','Left':'left',
    'In Progress':'inprogress','Completed':'completed',
    'Pending':'pending','On Hold':'onhold','Cancelled':'cancelled',
    'Credit':'credit','Debit':'debit','Partial':'partial',
    'Full-time':'fulltime','Part-time':'parttime',
    'Freelancer':'freelancer','Intern':'intern',
  };
  return map[status] || 'gray';
}
