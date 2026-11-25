// Pieces shared by "My profile" (/profile) and someone else's profile
// (/people/:kind/:id): the cover + identity header, info cards and the
// loading placeholder — so both pages line up exactly.
import { Avatar } from '../ui/Avatar';
import { Skeleton } from '../ui/Skeleton';

// 'PARTNER' / { name: 'PARTNER' } / 'employee' → 'Partner' / 'Employee'
// eslint-disable-next-line react-refresh/only-export-components
export function roleName(role, fallback = '') {
  const raw = (role && typeof role === 'object' ? role.name || role.label : role) || fallback;
  return String(raw || '').replace(/[_-]+/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

export function ProfileHero({ name, avatarUrl, avatarOverlay, badges, meta, actions, children }) {
  return (
    <section className="mac-card profile-hero">
      <div className="profile-cover" aria-hidden="true" />
      <div className="profile-head">
        <div className="profile-avatar">
          <Avatar name={name} src={avatarUrl} size={104} title="" />
          {avatarOverlay}
        </div>
        <div className="profile-id">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 className="profile-name">{name || 'Unnamed'}</h2>
            {badges}
          </div>
          {meta && <div className="profile-meta">{meta}</div>}
        </div>
        {actions && <div className="profile-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function ProfileCard({ icon: Icon, title, sub, action, children, ...rest }) {
  return (
    <section className="mac-card profile-card" {...rest}>
      <div className="profile-card-head">
        {Icon && <span className="profile-card-icon"><Icon size={18} aria-hidden="true" /></span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="profile-card-title">{title}</h3>
          {sub && <p className="profile-card-sub">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// Read-only facts: rows = [{ icon, label, value, href }]
export function InfoList({ rows }) {
  return (
    <dl className="info-list">
      {rows.filter(Boolean).map(({ icon: Icon, label, value, href }) => (
        <div key={label} className="info-row">
          {Icon && <Icon size={18} aria-hidden="true" />}
          <dt>{label}</dt>
          <dd className={value ? '' : 'is-empty'}>
            {value ? (href ? <a className="link" href={href}>{value}</a> : value) : 'Not added'}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// Same outline as the loaded page, so nothing jumps when the profile arrives.
export function ProfileSkeleton() {
  return (
    <div className="profile-wrap" aria-busy="true" aria-label="Loading profile">
      <section className="mac-card profile-hero">
        <div className="profile-cover" style={{ opacity: 0.35 }} />
        <div className="profile-head">
          <div className="profile-avatar"><Skeleton circle size={104} /></div>
          <div className="profile-id" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Skeleton width={220} height={24} />
            <Skeleton width={300} height={14} style={{ maxWidth: '100%' }} />
          </div>
        </div>
      </section>
      <div className="profile-grid">
        <section className="mac-card profile-card" style={{ minHeight: 420 }}>
          <Skeleton width={160} height={18} />
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} height={38} radius={10} style={{ width: '100%' }} />)}
        </section>
        <div className="profile-side">
          {[168, 140].map(h => (
            <section key={h} className="mac-card profile-card" style={{ minHeight: h }}>
              <Skeleton width={120} height={18} />
              <Skeleton height={12} style={{ width: '80%' }} />
              <Skeleton height={12} style={{ width: '60%' }} />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
