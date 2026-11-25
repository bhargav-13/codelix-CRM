// "Nothing here" placeholder. Same look as kit's EmptyPanel, without the card,
// so it can sit inside an existing card or table.
export default function EmptyState({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="empty-panel">
      {Icon && <span className="empty-icon"><Icon size={22} /></span>}
      <div className="empty-title">{title}</div>
      {subtitle && <div className="empty-text">{subtitle}</div>}
      {action}
    </div>
  );
}
