// Select on Radix — AlignUI Select shape (Root, Trigger, Value, Content, Item …)
// plus a one-line form:
//   <Select value={v} onValueChange={setV} placeholder="Choose…"
//           options={[{ value: 'a', label: 'Alpha', icon: RiUserLine }]} />
import * as SelectPrimitive from '@radix-ui/react-select';
import { RiArrowDownSLine, RiCheckLine } from '@remixicon/react';
import { cn } from './cn';

const SIZES = { medium: 'h-10 rounded-10 px-3', small: 'h-9 rounded-lg px-2.5', xsmall: 'h-8 rounded-lg px-2' };

function SelectTrigger({ size = 'medium', hasError, className, children, ref, ...rest }) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        'group/trigger inline-flex w-full min-w-0 items-center gap-2 bg-bg-white-0 text-left text-paragraph-sm text-text-strong-950 shadow-regular-xs outline-none',
        'ring-1 ring-inset ring-stroke-soft-200 transition-[box-shadow,background-color] duration-150 ease-out',
        'hover:bg-bg-weak-25 hover:ring-stroke-sub-300',
        'focus-visible:ring-2 focus-visible:ring-primary-logo focus-visible:shadow-[0_0_0_4px_var(--color-primary-alpha-16)]',
        'data-[state=open]:ring-2 data-[state=open]:ring-primary-logo data-[state=open]:shadow-[0_0_0_4px_var(--color-primary-alpha-16)]',
        'data-placeholder:text-text-soft-400 disabled:pointer-events-none disabled:bg-bg-weak-50 disabled:text-text-disabled-300 disabled:shadow-none disabled:ring-transparent',
        hasError && 'ring-red-500 hover:ring-red-500',
        SIZES[size] || SIZES.medium, className,
      )}
      {...rest}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 truncate">{children}</span>
      <SelectPrimitive.Icon asChild>
        <RiArrowDownSLine size={18} className="shrink-0 text-text-soft-400 transition-transform duration-200 group-data-[state=open]/trigger:rotate-180" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({ className, children, position = 'popper', sideOffset = 6, ...rest }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        sideOffset={sideOffset}
        style={{ '--ui-origin': 'var(--radix-select-content-transform-origin)' }}
        className={cn(
          'ui-pop z-[80] max-h-[min(var(--radix-select-content-available-height),320px)] min-w-[var(--radix-select-trigger-width)] overflow-hidden',
          'rounded-12 border border-stroke-soft-200 bg-bg-white-0 shadow-regular-md', className,
        )}
        {...rest}
      >
        <SelectPrimitive.Viewport className="p-1.5">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({ className, children, icon: Icon, ref, ...rest }) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex min-h-9 cursor-pointer select-none items-center gap-2 rounded-lg py-1.5 pl-2 pr-8 text-paragraph-sm text-text-strong-950 outline-none',
        'transition-colors duration-100 data-highlighted:bg-bg-weak-50 data-disabled:pointer-events-none data-disabled:text-text-disabled-300',
        'data-[state=checked]:text-primary-text data-[state=checked]:font-medium', className,
      )}
      {...rest}
    >
      {Icon && <Icon size={18} className="shrink-0 text-text-soft-400" aria-hidden="true" />}
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2 flex items-center text-primary-text"><RiCheckLine size={18} /></SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

const SelectGroupLabel = ({ className, ...rest }) => (
  <SelectPrimitive.Label className={cn('px-2 pb-1 pt-2 text-subheading-2xs uppercase text-text-soft-400', className)} {...rest} />
);
const SelectSeparator = ({ className, ...rest }) => (
  <SelectPrimitive.Separator className={cn('-mx-1.5 my-1.5 h-px bg-stroke-soft-200', className)} {...rest} />
);

// Radix forbids an empty-string value on items; map '' ⇄ a private token so
// "All"/"None" options keep working the way a native <select> does.
const EMPTY = '__empty__';
const enc = v => (v === '' || v == null ? EMPTY : String(v));
const dec = v => (v === EMPTY ? '' : v);

export function Select({ options = [], value, onValueChange, onChange, placeholder = 'Select…', size, hasError, className, id, name, disabled, 'aria-label': ariaLabel, children }) {
  const hasEmptyOption = options.some(o => o.value === '' || o.value == null);
  const current = value === '' || value == null ? (hasEmptyOption ? EMPTY : undefined) : String(value);
  return (
    <SelectPrimitive.Root value={current} onValueChange={v => { onValueChange?.(dec(v)); onChange?.(dec(v)); }} name={name} disabled={disabled}>
      <SelectTrigger id={id} size={size} hasError={hasError} className={className} aria-label={ariaLabel}>
        <SelectPrimitive.Value placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {children || options.map(o => (
          <SelectItem key={enc(o.value)} value={enc(o.value)} icon={o.icon} disabled={o.disabled}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </SelectPrimitive.Root>
  );
}

Object.assign(Select, {
  Root: SelectPrimitive.Root, Value: SelectPrimitive.Value, Group: SelectPrimitive.Group,
  Trigger: SelectTrigger, Content: SelectContent, Item: SelectItem, GroupLabel: SelectGroupLabel, Separator: SelectSeparator,
});
export default Select;
