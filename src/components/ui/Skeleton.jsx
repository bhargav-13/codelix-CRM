// Shimmering placeholder. Give it the size of what will replace it so nothing
// moves when the data arrives:  <Skeleton width={120} height={16} />  <Skeleton circle size={40} />
import { cn } from './cn';

export function Skeleton({ width, height = 12, size, circle, radius, className, style, ...rest }) {
  const w = size ?? width, h = size ?? height;
  return (
    <span aria-hidden="true" className={cn('skeleton', className)}
      style={{ width: w, height: h, borderRadius: circle ? '50%' : radius, ...style }} {...rest} />
  );
}
export default Skeleton;
