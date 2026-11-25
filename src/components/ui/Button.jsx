/* eslint-disable react-refresh/only-export-components */
// Button — same API shape as AlignUI's Button (variant × mode × size, Root/Icon
// parts), written for this codebase.
//   <Button onClick={save}>Save</Button>
//   <Button variant="neutral" mode="stroke" size="small" leftIcon={RiAddLine}>Add</Button>
//   <Button loading loadingText="Saving…">Save</Button>
// `loading` shows a spinner inside the button and ignores further clicks; the
// button keeps its colour and never shows a "not allowed" cursor.
import { Slot } from '@radix-ui/react-slot';
import { RiLoader4Line } from '@remixicon/react';
import { tv } from './cn';

export const buttonVariants = tv({
  slots: {
    root: [
      'group relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap outline-none',
      'text-label-sm transition-[background-color,color,box-shadow,transform,opacity] duration-150 ease-out',
      'active:scale-[0.975] focus-visible:shadow-focus-ring',
      'disabled:pointer-events-none disabled:bg-bg-weak-50 disabled:text-text-disabled-300 disabled:shadow-none disabled:ring-transparent',
      'aria-busy:pointer-events-none',
    ],
    icon: 'flex size-5 shrink-0 items-center justify-center',
  },
  variants: {
    variant: { primary: {}, neutral: {}, error: {} },
    mode: { filled: {}, stroke: { root: 'ring-1 ring-inset' }, lighter: {}, ghost: {} },
    size: {
      medium: { root: 'h-10 gap-2 rounded-10 px-3.5' },
      small: { root: 'h-9 gap-2 rounded-lg px-3' },
      xsmall: { root: 'h-8 gap-1.5 rounded-lg px-2.5' },
      xxsmall: { root: 'h-7 gap-1.5 rounded-lg px-2', icon: 'size-4' },
    },
    fullWidth: { true: { root: 'w-full' } },
  },
  compoundVariants: [
    { variant: 'primary', mode: 'filled', class: { root: 'bg-primary-base text-static-white shadow-[0_1px_2px_#0e121b33,inset_0_1px_0_#ffffff24] hover:bg-primary-darker' } },
    { variant: 'primary', mode: 'stroke', class: { root: 'bg-bg-white-0 text-primary-text ring-primary-base hover:bg-primary-alpha-10' } },
    { variant: 'primary', mode: 'lighter', class: { root: 'bg-primary-alpha-10 text-primary-text hover:bg-primary-alpha-16' } },
    { variant: 'primary', mode: 'ghost', class: { root: 'bg-transparent text-primary-text hover:bg-primary-alpha-10' } },

    { variant: 'neutral', mode: 'filled', class: { root: 'bg-bg-strong-950 text-text-white-0 hover:bg-bg-surface-800' } },
    { variant: 'neutral', mode: 'stroke', class: { root: 'bg-bg-white-0 text-text-sub-600 shadow-regular-xs ring-stroke-soft-200 hover:bg-bg-weak-50 hover:text-text-strong-950 hover:ring-stroke-sub-300' } },
    { variant: 'neutral', mode: 'lighter', class: { root: 'bg-bg-weak-50 text-text-sub-600 hover:bg-bg-soft-200 hover:text-text-strong-950' } },
    { variant: 'neutral', mode: 'ghost', class: { root: 'bg-transparent text-text-sub-600 hover:bg-bg-weak-50 hover:text-text-strong-950' } },

    { variant: 'error', mode: 'filled', class: { root: 'bg-red-700 text-static-white shadow-[0_1px_2px_#0e121b33,inset_0_1px_0_#ffffff24] hover:bg-red-800' } },
    { variant: 'error', mode: 'stroke', class: { root: 'bg-bg-white-0 text-(--bad) ring-red-alpha-24 hover:bg-red-alpha-10' } },
    { variant: 'error', mode: 'lighter', class: { root: 'bg-red-alpha-10 text-(--bad) hover:bg-red-alpha-16' } },
    { variant: 'error', mode: 'ghost', class: { root: 'bg-transparent text-(--bad) hover:bg-red-alpha-10' } },
  ],
  defaultVariants: { variant: 'primary', mode: 'filled', size: 'medium' },
});

export function Spinner({ size = 18, className }) {
  return <RiLoader4Line size={size} className={`animate-spin ${className || ''}`} aria-hidden="true" />;
}

function ButtonIcon({ as: Comp = 'span', size, className, children, ...rest }) {
  const { icon } = buttonVariants({ size });
  return <Comp className={icon({ class: className })} {...rest}>{children}</Comp>;
}

function ButtonRoot({
  variant, mode, size, fullWidth, asChild, loading = false, loadingText,
  leftIcon: Left, rightIcon: Right, className, children, onClick, type = 'button', ref, ...rest
}) {
  const Comp = asChild ? Slot : 'button';
  const { root } = buttonVariants({ variant, mode, size, fullWidth });
  const iconSize = size === 'xxsmall' ? 16 : 18;
  // While loading: swallow clicks (and the implicit form submit they trigger)
  const handleClick = e => { if (loading) { e.preventDefault(); e.stopPropagation(); return; } onClick?.(e); };
  if (asChild) return <Comp ref={ref} className={root({ class: className })} onClick={handleClick} {...rest}>{children}</Comp>;
  return (
    <Comp ref={ref} type={type} className={root({ class: className })} aria-busy={loading || undefined} onClick={handleClick} {...rest}>
      {loading ? <Spinner size={iconSize} /> : Left ? <Left size={iconSize} aria-hidden="true" className="shrink-0" /> : null}
      {loading && loadingText ? loadingText : children}
      {!loading && Right ? <Right size={iconSize} aria-hidden="true" className="shrink-0" /> : null}
    </Comp>
  );
}

// Square icon-only button (AlignUI "CompactButton"). Always give it a label.
const iconButtonVariants = tv({
  base: [
    'relative inline-flex shrink-0 items-center justify-center outline-none',
    'transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.94]',
    'focus-visible:shadow-focus-ring disabled:pointer-events-none disabled:text-text-disabled-300',
  ],
  variants: {
    variant: {
      stroke: 'bg-bg-white-0 text-text-sub-600 shadow-regular-xs ring-1 ring-inset ring-stroke-soft-200 hover:bg-bg-weak-50 hover:text-text-strong-950',
      ghost: 'bg-transparent text-text-sub-600 hover:bg-neutral-alpha-16 hover:text-text-strong-950',
      primary: 'bg-primary-base text-static-white hover:bg-primary-darker',
    },
    size: { large: 'size-10 rounded-10', medium: 'size-9 rounded-10', small: 'size-8 rounded-lg', xsmall: 'size-7 rounded-lg' },
    round: { true: 'rounded-full' },
  },
  defaultVariants: { variant: 'ghost', size: 'medium' },
});

export function IconButton({ icon: Icon, label, variant, size, round, className, children, type = 'button', ref, ...rest }) {
  const px = size === 'xsmall' ? 16 : size === 'small' ? 18 : 20;
  return (
    <button ref={ref} type={type} aria-label={label} title={rest.title} className={iconButtonVariants({ variant, size, round, class: className })} {...rest}>
      {Icon ? <Icon size={px} aria-hidden="true" /> : children}
    </button>
  );
}

export const Button = Object.assign(ButtonRoot, { Root: ButtonRoot, Icon: ButtonIcon });
export { ButtonRoot as Root, ButtonIcon as Icon };
export default Button;
