// Divider: a hairline, optionally with a centred label.
//   <Divider />   <Divider>or</Divider>   <Divider orientation="vertical" />
import { cn } from './cn';

export function Divider({ orientation = 'horizontal', className, children, ...rest }) {
  if (orientation === 'vertical') {
    return <span role="separator" aria-orientation="vertical" className={cn('inline-block w-px self-stretch bg-stroke-soft-200', className)} {...rest} />;
  }
  if (!children) return <div role="separator" className={cn('h-px w-full bg-stroke-soft-200', className)} {...rest} />;
  return (
    <div role="separator"
      className={cn('flex w-full items-center gap-2.5 text-subheading-2xs uppercase text-text-soft-400',
        'before:h-px before:flex-1 before:bg-stroke-soft-200 after:h-px after:flex-1 after:bg-stroke-soft-200', className)}
      {...rest}>
      {children}
    </div>
  );
}
export default Divider;
