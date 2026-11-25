// Keyboard key hint: <Kbd>Ctrl K</Kbd>. modKey() gives "⌘" on Apple devices, "Ctrl" elsewhere.
import { cn } from './cn';

// eslint-disable-next-line react-refresh/only-export-components
export const isApple = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
// eslint-disable-next-line react-refresh/only-export-components
export const modKey = () => (isApple() ? '⌘' : 'Ctrl');

export function Kbd({ tone = 'default', className, children, ...rest }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 shrink-0 items-center justify-center whitespace-nowrap rounded-[5px] px-1.5 font-sans text-[11px] font-medium leading-none',
        tone === 'inverse'
          ? 'bg-white-alpha-16 text-static-white'
          : 'bg-bg-weak-50 text-text-sub-600 ring-1 ring-inset ring-stroke-soft-200',
        className,
      )}
      {...rest}
    >
      {children}
    </kbd>
  );
}
export default Kbd;
