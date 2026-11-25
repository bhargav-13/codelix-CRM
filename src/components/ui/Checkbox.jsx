// Checkbox on Radix: <Checkbox checked={v} onCheckedChange={setV} id="x" />  (checked may be 'indeterminate')
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { RiCheckLine, RiSubtractLine } from '@remixicon/react';
import { cn } from './cn';

export function Checkbox({ className, checked, ref, ...rest }) {
  return (
    <CheckboxPrimitive.Root
      ref={ref} checked={checked}
      className={cn(
        'group inline-flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] outline-none',
        'bg-bg-white-0 shadow-regular-xs ring-1 ring-inset ring-stroke-sub-300 transition-[background-color,box-shadow,transform] duration-150 ease-out',
        'hover:ring-primary-logo active:scale-90',
        'data-[state=checked]:bg-primary-base data-[state=checked]:ring-primary-base data-[state=indeterminate]:bg-primary-base data-[state=indeterminate]:ring-primary-base',
        'focus-visible:shadow-focus-ring disabled:pointer-events-none disabled:opacity-50', className,
      )}
      {...rest}
    >
      <CheckboxPrimitive.Indicator className="flex animate-[ui-pop-in_140ms_ease-out] text-static-white">
        {checked === 'indeterminate' ? <RiSubtractLine size={14} /> : <RiCheckLine size={14} />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
export default Checkbox;
