/* eslint-disable react-refresh/only-export-components */
// People, clickable everywhere.
//   <PersonChip person={{ kind: 'employee', id, name }} />      avatar + name → /people/employee/<id>
//   <PersonChip person={ref} sub />                               … with job title underneath
//   <PersonLink person={ref} />                                   just the name, as a link
//   <PersonAvatar person={ref} size={32} />                       just the photo, as a link
// A person ref is { kind: 'partner' | 'employee', id, name } (see src/lib/people.js).
// Photo, job title, email and phone are looked up in the shared directory, and
// hovering (or focusing) shows a card with "View profile" and "Message".
// With only a name (a string, or a ref without kind/id) they render the same
// way, without a link.
import { Link } from 'react-router-dom';
import * as HoverCard from '@radix-ui/react-hover-card';
import { RiMailLine, RiMessage2Line, RiPhoneLine, RiUserLine } from '@remixicon/react';
import { usePeople, roleLabel } from '../../lib/people';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { cn } from './cn';

export const personPath = p => `/people/${encodeURIComponent(p.kind)}/${encodeURIComponent(p.id)}`;
export const isPersonRef = p => !!p && typeof p === 'object' && !!p.kind && p.id != null && p.id !== '';

// ref (or bare name) → the fullest record we have for that person
export function usePerson(ref) {
  const { byKey, people } = usePeople();
  if (!ref) return null;
  if (typeof ref === 'string') {
    const name = ref.trim().toLowerCase();
    const hits = name ? people.filter(p => (p.name || '').trim().toLowerCase() === name) : [];
    return hits.length === 1 ? { ...hits[0], linkable: true } : { name: ref, linkable: false };
  }
  if (!isPersonRef(ref)) return { ...ref, linkable: false };
  const found = byKey.get(`${ref.kind}:${ref.id}`);
  return { ...ref, ...found, name: found?.name || ref.name || '', linkable: true };
}

export function PersonCardContent({ person }) {
  const { isEmployee, can, person: mine } = useAuth() || {};
  const isMe = !!mine && mine.kind === person.kind && String(mine.id) === String(person.id);
  const canChat = !isMe && (!isEmployee || can?.('chat'));
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <Avatar name={person.name} src={person.avatarUrl} size={48} />
        <div className="min-w-0">
          <div className="truncate text-label-md text-text-strong-950">{person.name || 'Unknown'}</div>
          <div className="truncate text-paragraph-xs text-text-sub-600">{roleLabel(person)}{person.active === false ? ' · Inactive' : ''}</div>
        </div>
      </div>
      {(person.email || person.phone) && (
        <div className="flex flex-col gap-1.5">
          {person.email && <div className="person-card-row"><RiMailLine size={16} /><a className="truncate text-text-sub-600 transition-colors hover:text-primary-text hover:underline" href={`mailto:${person.email}`}>{person.email}</a></div>}
          {person.phone && <div className="person-card-row"><RiPhoneLine size={16} /><a className="truncate text-text-sub-600 transition-colors hover:text-primary-text hover:underline" href={`tel:${String(person.phone).replace(/[^\d+]/g, '')}`}>{person.phone}</a></div>}
        </div>
      )}
      <div className="flex gap-2">
        <Button asChild size="xsmall" variant="neutral" mode="stroke" className="flex-1">
          <Link to={isMe ? '/profile' : personPath(person)}><RiUserLine size={16} aria-hidden="true" />View profile</Link>
        </Button>
        {canChat && (
          <Button asChild size="xsmall" className="flex-1">
            <Link to="/chat" state={{ startWith: { kind: person.kind, id: person.id, name: person.name } }}><RiMessage2Line size={16} aria-hidden="true" />Message</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

// Wraps a trigger (a link) with the hover card. `disabled` renders the trigger alone.
export function PersonHoverCard({ person, disabled, side = 'bottom', align = 'start', children }) {
  if (disabled || !person?.linkable) return children;
  return (
    <HoverCard.Root openDelay={350} closeDelay={120}>
      <HoverCard.Trigger asChild>{children}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content side={side} align={align} sideOffset={8} collisionPadding={12}
          className="person-card ui-pop" style={{ '--ui-origin': 'var(--radix-hover-card-content-transform-origin)' }}
          onClick={e => e.stopPropagation()}>
          <PersonCardContent person={person} />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

// stop a click on a person from also triggering the row/card it sits in
const stop = e => e.stopPropagation();

export function PersonAvatar({ person: ref, size = 32, status, card = true, className, ...rest }) {
  const person = usePerson(ref);
  if (!person) return null;
  const avatar = <Avatar name={person.name} src={person.avatarUrl} size={size} status={status} {...rest} />;
  if (!person.linkable) return <span className={className}>{avatar}</span>;
  return (
    <PersonHoverCard person={person} disabled={!card}>
      <Link to={personPath(person)} onClick={stop} className={cn('avatar-link', className)} aria-label={`${person.name || 'Person'} — view profile`}>{avatar}</Link>
    </PersonHoverCard>
  );
}

export function PersonChip({ person: ref, size = 24, sub = false, card = true, className, fallback = '—' }) {
  const person = usePerson(ref);
  if (!person || !(person.name || person.linkable)) return <span className="faint">{fallback}</span>;
  const subText = sub === true ? roleLabel(person) : sub || null;
  const body = (
    <>
      <Avatar name={person.name} src={person.avatarUrl} size={size} title="" />
      <span className="min-w-0">
        <span className="person-chip-name block">{person.name || 'Unknown'}</span>
        {subText && person.linkable && <span className="person-chip-sub">{subText}</span>}
      </span>
    </>
  );
  if (!person.linkable) return <span className={cn('person-chip', className)}>{body}</span>;
  return (
    <PersonHoverCard person={person} disabled={!card}>
      <Link to={personPath(person)} onClick={stop} className={cn('person-chip', className)}>{body}</Link>
    </PersonHoverCard>
  );
}

export function PersonLink({ person: ref, card = true, className, fallback = '—', children }) {
  const person = usePerson(ref);
  if (!person || !(person.name || person.linkable)) return <span className="faint">{fallback}</span>;
  if (!person.linkable) return <span className={cn('person-link', className)}>{children || person.name}</span>;
  return (
    <PersonHoverCard person={person} disabled={!card}>
      <Link to={personPath(person)} onClick={stop} className={cn('person-link', className)}>{children || person.name || 'Unknown'}</Link>
    </PersonHoverCard>
  );
}

export default PersonChip;
