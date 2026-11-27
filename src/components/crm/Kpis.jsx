// A row of equal number cards for the CRM screens. Every card has the same three lines
// (label, value, note), each kept to one line, so the row always lines up.
//   <Kpis cols={4} items={[{ label, value, sub, icon, tone, valueTone, active, onClick }]} />
// tone: good | bad | warn | brand | primary (the filled one). valueTone: in | out colours the number.
import './Kpis.css';

export default function Kpis({ items, cols = 4 }) {
  return (
    <div className="crm-kpis" style={{ '--cols': cols }}>
      {items.map(({ label, value, sub, icon: Icon, tone, valueTone, active, onClick }) => {
        const Tag = onClick ? 'button' : 'div';
        return (
          <Tag key={label} type={onClick ? 'button' : undefined} onClick={onClick} aria-pressed={onClick ? !!active : undefined}
            className={`mac-card crm-kpi ${tone ? `is-${tone}` : ''} ${active ? 'is-active' : ''} ${onClick ? 'is-click' : ''}`}>
            <span className="crm-kpi-top">
              <span className="crm-kpi-label" title={label}>{label}</span>
              {Icon && <span className="crm-kpi-icon"><Icon size={16} aria-hidden="true" /></span>}
            </span>
            <span className={`crm-kpi-value ${valueTone ? `is-${valueTone}` : ''}`}>{value}</span>
            <span className="crm-kpi-sub" title={typeof sub === 'string' ? sub : undefined}>{sub || ' '}</span>
          </Tag>
        );
      })}
    </div>
  );
}
