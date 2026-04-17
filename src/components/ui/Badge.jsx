const COLORS = {
  gray:       { bg:'rgba(142,142,147,0.12)', color:'#6E6E73' },
  blue:       { bg:'rgba(0,113,227,0.1)',    color:'#0071E3' },
  green:      { bg:'rgba(52,199,89,0.1)',    color:'#34C759' },
  red:        { bg:'rgba(255,59,48,0.1)',    color:'#FF3B30' },
  orange:     { bg:'rgba(255,149,0,0.1)',    color:'#FF9500' },
  yellow:     { bg:'rgba(255,204,0,0.12)',   color:'#B07D00' },
  purple:     { bg:'rgba(175,82,222,0.1)',   color:'#AF52DE' },
  hot:        { bg:'rgba(255,59,48,0.1)',    color:'#FF3B30' },
  warm:       { bg:'rgba(255,149,0,0.1)',    color:'#FF9500' },
  cold:       { bg:'rgba(0,113,227,0.1)',    color:'#0071E3' },
  won:        { bg:'rgba(52,199,89,0.1)',    color:'#34C759' },
  lost:       { bg:'rgba(142,142,147,0.1)',  color:'#8E8E93' },
  high:       { bg:'rgba(255,59,48,0.1)',    color:'#FF3B30' },
  medium:     { bg:'rgba(255,149,0,0.1)',    color:'#FF9500' },
  low:        { bg:'rgba(142,142,147,0.1)',  color:'#8E8E93' },
  active:     { bg:'rgba(52,199,89,0.1)',    color:'#34C759' },
  inactive:   { bg:'rgba(142,142,147,0.1)',  color:'#8E8E93' },
  left:       { bg:'rgba(142,142,147,0.1)',  color:'#8E8E93' },
  inprogress: { bg:'rgba(0,113,227,0.1)',    color:'#0071E3' },
  completed:  { bg:'rgba(52,199,89,0.1)',    color:'#34C759' },
  pending:    { bg:'rgba(255,204,0,0.12)',   color:'#B07D00' },
  onhold:     { bg:'rgba(255,149,0,0.1)',    color:'#FF9500' },
  cancelled:  { bg:'rgba(142,142,147,0.1)',  color:'#8E8E93' },
  credit:     { bg:'rgba(52,199,89,0.1)',    color:'#34C759' },
  debit:      { bg:'rgba(255,59,48,0.1)',    color:'#FF3B30' },
  partial:    { bg:'rgba(255,149,0,0.1)',    color:'#FF9500' },
  fulltime:   { bg:'rgba(0,113,227,0.1)',    color:'#0071E3' },
  parttime:   { bg:'rgba(175,82,222,0.1)',   color:'#AF52DE' },
  freelancer: { bg:'rgba(255,204,0,0.12)',   color:'#B07D00' },
  intern:     { bg:'rgba(142,142,147,0.1)',  color:'#8E8E93' },
};

export default function Badge({ children, color = 'gray' }) {
  const c = COLORS[color] || COLORS.gray;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 100,
      fontSize: 11, fontWeight: 550, letterSpacing: '0.1px',
      background: c.bg, color: c.color,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

export function getStatusColor(status) {
  const map = {
    'Hot':'hot','Warm':'warm','Cold':'cold',
    'Closed Won':'won','Closed Lost':'lost',
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
