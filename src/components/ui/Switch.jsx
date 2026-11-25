// Switch on Radix: <Switch checked={on} onCheckedChange={setOn} aria-label="Dark mode" />
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from './cn';

export function Switch({ className, ref, ...rest }) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        'group relative inline-flex h-5 w-8 shrink-0 cursor-pointer items-center rounded-full p-0.5 outline-none',
        'bg-bg-soft-200 transition-colors duration-200 ease-out hover:bg-bg-sub-300',
        'data-[state=checked]:bg-primary-base data-[state=checked]:hover:bg-primary-darker',
        'focus-visible:shadow-focus-ring disabled:pointer-events-none disabled:opacity-50', className,
      )}
      {...rest}
    >
      <SwitchPrimitive.Thumb className="block size-4 rounded-full bg-static-white shadow-switch-thumb transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-active:scale-90 data-[state=checked]:translate-x-3" />
    </SwitchPrimitive.Root>
  );
}
export default Switch;
