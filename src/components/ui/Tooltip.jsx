/* eslint-disable react-refresh/only-export-components */
// Tooltip on Radix. Wrap any focusable element:
//   <Tooltip content="Collapse sidebar" shortcut="Ctrl B" side="right"><button>…</button></Tooltip>
// `disabled` renders the child untouched (used by the sidebar when labels are visible).
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from './cn';
import { Kbd } from './Kbd';

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({ content, shortcut, side = 'top', align = 'center', sideOffset = 8, delay = 250, disabled, className, children }) {
  if (disabled || !content) return children;
  return (
    <TooltipPrimitive.Provider delayDuration={delay} skipDelayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side} align={align} sideOffset={sideOffset} collisionPadding={8}
            style={{ '--ui-origin': 'var(--radix-tooltip-content-transform-origin)' }}
            className={cn(
              'ui-pop z-[90] flex max-w-[260px] items-center gap-2 rounded-lg bg-neutral-950 px-2.5 py-1.5 text-label-xs text-static-white shadow-tooltip',
              'dark:bg-neutral-700 dark:ring-1 dark:ring-white-alpha-10', className,
            )}
          >
            {content}
            {shortcut && <Kbd tone="inverse">{shortcut}</Kbd>}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

Object.assign(Tooltip, { Provider: TooltipPrimitive.Provider, Root: TooltipPrimitive.Root, Trigger: TooltipPrimitive.Trigger, Content: TooltipPrimitive.Content });
export default Tooltip;
