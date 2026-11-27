// "Search or jump to…" — Ctrl/Cmd+K. Lists the pages this person can open, the
// people in the directory and a few quick actions; type to filter, ↑ ↓ to move,
// Enter to go, Esc to close.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import {
  RiArrowDownLine, RiArrowUpLine, RiCornerDownLeftLine, RiLockPasswordLine, RiLogoutBoxRLine,
  RiSearchLine, RiSideBarLine, RiUserLine,
} from '@remixicon/react';
import { useAuth } from '../../contexts/AuthContext';
import { usePeople, roleLabel } from '../../lib/people';
import { Avatar } from '../ui/Avatar';
import { Kbd, modKey } from '../ui/Kbd';
import { useNavSections, useShell } from './shell';

// every word typed must appear somewhere; titles that start with the query come first
function rank(item, words, q) {
  const title = item.title.toLowerCase();
  const hay = `${title} ${(item.sub || '').toLowerCase()} ${item.keywords || ''}`;
  if (!words.every(w => hay.includes(w))) return -1;
  if (title.startsWith(q)) return 3;
  if (title.split(/\s+/).some(part => part.startsWith(words[0]))) return 2;
  return title.includes(words[0]) ? 1 : 0;
}

function PaletteBody({ onClose }) {
  const navigate = useNavigate();
  const { logout, person: mine } = useAuth();
  const { people } = usePeople();
  const sections = useNavSections();
  const { collapsed, toggleCollapsed, openChangePassword } = useShell();
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef(null);
  const baseId = useId();

  const groups = useMemo(() => {
    const go = to => () => navigate(to);
    const pages = [
      ...sections.flatMap(s => s.items.map(i => ({ key: `page:${i.to}`, title: i.label, sub: s.title, keywords: i.keywords, icon: i.icon, run: go(i.to) }))),
      { key: 'page:/profile', title: 'My profile', sub: 'Account', keywords: 'me account photo details settings', icon: RiUserLine, run: go('/profile') },
    ];
    const persons = people.filter(p => p.active !== false).map(p => {
      const isMe = !!mine && mine.kind === p.kind && String(mine.id) === String(p.id);
      return {
        key: `person:${p.kind}:${p.id}`, title: p.name || 'Unknown', sub: [roleLabel(p), p.email].filter(Boolean).join(' · '),
        keywords: `${p.phone || ''} ${p.kind}`, person: p, run: go(isMe ? '/profile' : `/people/${encodeURIComponent(p.kind)}/${encodeURIComponent(p.id)}`),
      };
    });
    const actions = [
      { key: 'act:sidebar', title: collapsed ? 'Expand sidebar' : 'Collapse sidebar', keywords: 'menu navigation rail', icon: RiSideBarLine, hint: `${modKey()} B`, run: toggleCollapsed },
      { key: 'act:password', title: 'Change password', keywords: 'security', icon: RiLockPasswordLine, run: () => requestAnimationFrame(openChangePassword) },
      { key: 'act:signout', title: 'Sign out', keywords: 'log out logout', icon: RiLogoutBoxRLine, run: () => logout() },
    ];

    const q = query.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const pick = (items, limit) => {
      if (!words.length) return items.slice(0, limit);
      return items.map(item => ({ item, score: rank(item, words, q) })).filter(x => x.score >= 0)
        .sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.item);
    };
    return [
      { title: 'Pages', items: pick(pages, 12) },
      { title: 'People', items: pick(persons, words.length ? 8 : 5) },
      { title: 'Actions', items: pick(actions, 6) },
    ].filter(g => g.items.length);
  }, [sections, people, mine, query, collapsed, navigate, toggleCollapsed, openChangePassword, logout]);

  const flat = useMemo(() => groups.flatMap(g => g.items), [groups]);
  const active = Math.min(sel, Math.max(0, flat.length - 1));
  const optionId = i => `${baseId}-opt-${i}`;

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, flat]);

  function run(item) {
    if (!item) return;
    onClose();
    item.run();
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(flat.length ? (active + 1) % flat.length : 0); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(flat.length ? (active - 1 + flat.length) % flat.length : 0); }
    else if (e.key === 'Home' && !query) { e.preventDefault(); setSel(0); }
    else if (e.key === 'End' && !query) { e.preventDefault(); setSel(Math.max(0, flat.length - 1)); }
    else if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); run(flat[active]); }
  }

  const indexOf = new Map(flat.map((item, i) => [item.key, i]));
  return (
    <>
      <div className="cmdk-input">
        <RiSearchLine size={20} aria-hidden="true" />
        <input
          autoFocus value={query} onChange={e => { setQuery(e.target.value); setSel(0); }} onKeyDown={onKeyDown}
          placeholder="Search or jump to…" aria-label="Search pages, people and actions"
          role="combobox" aria-expanded="true" aria-controls={`${baseId}-list`} aria-autocomplete="list"
          aria-activedescendant={flat.length ? optionId(active) : undefined}
          autoComplete="off" autoCorrect="off" spellCheck={false}
        />
        <Kbd>Esc</Kbd>
      </div>

      <div ref={listRef} id={`${baseId}-list`} role="listbox" aria-label="Results" className="cmdk-list">
        {flat.length === 0 && (
          <div className="cmdk-empty">Nothing matches <strong style={{ color: 'var(--ink)' }}>“{query.trim()}”</strong>. Try a page name or a person.</div>
        )}
        {groups.map(g => (
          <div key={g.title} role="group" aria-label={g.title}>
            <div className="cmdk-group" aria-hidden="true">{g.title}</div>
            {g.items.map(item => {
              const i = indexOf.get(item.key);
              const Icon = item.icon;
              return (
                <div key={item.key} id={optionId(i)} role="option" aria-selected={i === active} className="cmdk-item"
                  onMouseMove={() => { if (i !== active) setSel(i); }} onClick={() => run(item)}>
                  {item.person
                    ? <Avatar name={item.person.name} src={item.person.avatarUrl} size={28} title="" />
                    : <span className="cmdk-icon">{Icon && <Icon size={17} aria-hidden="true" />}</span>}
                  <span className="cmdk-item-main">
                    <span className="cmdk-item-title">{item.title}</span>
                    {item.person && item.sub && <span className="cmdk-item-sub">{item.sub}</span>}
                  </span>
                  {!item.person && item.sub && <span className="cmdk-item-sub">{item.sub}</span>}
                  {item.hint && <Kbd>{item.hint}</Kbd>}
                  <span className="cmdk-enter" aria-hidden="true"><RiCornerDownLeftLine size={16} /></span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="cmdk-foot" aria-hidden="true">
        <span><Kbd><RiArrowUpLine size={12} /></Kbd><Kbd><RiArrowDownLine size={12} /></Kbd> to move</span>
        <span><Kbd><RiCornerDownLeftLine size={12} /></Kbd> to open</span>
        <span style={{ marginLeft: 'auto' }}><Kbd>{modKey()} K</Kbd> to toggle</span>
      </div>
    </>
  );
}

export default function CommandPalette({ open, onOpenChange }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="cmdk-overlay ui-overlay">
          <Dialog.Content className="cmdk ui-pop" aria-describedby={undefined} style={{ '--ui-origin': 'center top' }}>
            <Dialog.Title className="sr-only">Search or jump to</Dialog.Title>
            <PaletteBody onClose={() => onOpenChange(false)} />
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
