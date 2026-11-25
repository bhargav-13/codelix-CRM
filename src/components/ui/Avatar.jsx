/* eslint-disable react-refresh/only-export-components */
// Avatar: a photo, or initials on a stable colour per name when there is no
// photo (or it fails to load). Optional status dot. AvatarGroup stacks several.
//   <Avatar name="Asha Rao" src={url} size={40} status="online" />
//   <AvatarGroup people={[{ name, src }]} max={4} size={28} />
import { useState } from 'react';
import { cn } from './cn';

const COLORS = {
  blue: 'bg-blue-200 text-blue-950 dark:bg-blue-alpha-24 dark:text-blue-300',
  sky: 'bg-sky-200 text-sky-950 dark:bg-sky-alpha-24 dark:text-sky-300',
  purple: 'bg-purple-200 text-purple-950 dark:bg-purple-alpha-24 dark:text-purple-300',
  teal: 'bg-teal-200 text-teal-950 dark:bg-teal-alpha-24 dark:text-teal-300',
  green: 'bg-green-200 text-green-950 dark:bg-green-alpha-24 dark:text-green-300',
  yellow: 'bg-yellow-200 text-yellow-950 dark:bg-yellow-alpha-24 dark:text-yellow-300',
  orange: 'bg-orange-200 text-orange-950 dark:bg-orange-alpha-24 dark:text-orange-300',
  pink: 'bg-pink-200 text-pink-950 dark:bg-pink-alpha-24 dark:text-pink-300',
  gray: 'bg-bg-soft-200 text-text-sub-600',
};
const CYCLE = ['blue', 'purple', 'teal', 'orange', 'sky', 'pink', 'green', 'yellow'];
const STATUS = { online: 'bg-green-500', busy: 'bg-red-500', away: 'bg-yellow-500', offline: 'bg-neutral-400' };

export const initialsOf = (name = '') => String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
export function colorOf(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CYCLE[h % CYCLE.length];
}

export function Avatar({ name = '', src, size = 32, color, status, square = false, className, style, title, ...rest }) {
  const [failed, setFailed] = useState(null);     // the src that failed to load
  const showImage = !!src && failed !== src;
  const dot = Math.max(8, Math.round(size * 0.28));
  const label = name || '';
  return (
    <span
      className={cn('relative inline-flex shrink-0 select-none items-center justify-center align-middle font-semibold leading-none',
        square ? 'rounded-[28%]' : 'rounded-full', !showImage && (COLORS[color] || COLORS[colorOf(label)]), className)}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)), ...style }}
      title={title ?? (label || undefined)}
      {...rest}
    >
      {showImage
        ? <img src={src} alt={label ? `Photo of ${label}` : ''} loading="lazy" decoding="async" draggable={false}
            onError={() => setFailed(src)}
            className={cn('size-full object-cover', square ? 'rounded-[28%]' : 'rounded-full')} />
        : <span aria-hidden={label ? true : undefined}>{initialsOf(label)}</span>}
      {status && (
        <span
          role="img" aria-label={status}
          className={cn('absolute bottom-0 right-0 rounded-full ring-2 ring-bg-white-0', STATUS[status] || STATUS.offline)}
          style={{ width: dot, height: dot }}
        />
      )}
    </span>
  );
}

export function AvatarGroup({ people = [], max = 4, size = 28, className, renderItem }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  const overlap = -Math.round(size * 0.28);
  return (
    <span className={cn('inline-flex items-center', className)}>
      {shown.map((p, i) => (
        <span key={p.key || p.id || `${p.name}-${i}`}
          className="relative inline-flex rounded-full ring-2 ring-bg-white-0 transition-transform duration-150 hover:z-10 hover:-translate-y-0.5"
          style={{ marginLeft: i ? overlap : 0 }}>
          {renderItem ? renderItem(p, size) : <Avatar name={p.name} src={p.src || p.avatarUrl} size={size} />}
        </span>
      ))}
      {extra > 0 && (
        <span className="relative inline-flex items-center justify-center rounded-full bg-bg-weak-50 font-medium tabular-nums text-text-sub-600 ring-2 ring-bg-white-0"
          style={{ width: size, height: size, marginLeft: overlap, fontSize: Math.max(10, Math.round(size * 0.36)) }}
          title={people.slice(max).map(p => p.name).join(', ')}>
          +{extra}
        </span>
      )}
    </span>
  );
}

export default Avatar;
