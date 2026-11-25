/* eslint-disable react-refresh/only-export-components */
// Dropdown menu on Radix — AlignUI Dropdown shape (Root, Trigger, Content, Item,
// Label, Separator …). Keyboard: arrows, type-ahead, Esc; animated in and out.
//   <Dropdown.Root>
//     <Dropdown.Trigger asChild><button>…</button></Dropdown.Trigger>
//     <Dropdown.Content align="end">
//       <Dropdown.Item icon={RiUserLine} onSelect={…}>Profile</Dropdown.Item>
//     </Dropdown.Content>
//   </Dropdown.Root>
import * as Menu from '@radix-ui/react-dropdown-menu';
import { RiArrowRightSLine, RiCheckLine } from '@remixicon/react';
import { cn } from './cn';

const panel = 'ui-pop menu min-w-[200px] max-w-[min(320px,calc(100vw-16px))] outline-none';
const origin = { '--ui-origin': 'var(--radix-dropdown-menu-content-transform-origin)' };

function Content({ className, sideOffset = 6, align = 'end', collisionPadding = 8, style, children, ...rest }) {
  return (
    <Menu.Portal>
      <Menu.Content sideOffset={sideOffset} align={align} collisionPadding={collisionPadding}
        className={cn(panel, className)} style={{ ...origin, ...style }} {...rest}>
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}

function Item({ icon: Icon, danger, shortcut, className, children, ...rest }) {
  return (
    <Menu.Item className={cn('menu-item', danger && 'danger', className)} {...rest}>
      {Icon && <Icon size={18} aria-hidden="true" />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && <span className="ml-4 text-paragraph-xs text-text-soft-400">{shortcut}</span>}
    </Menu.Item>
  );
}

function CheckItem({ icon: Icon, className, children, ...rest }) {
  return (
    <Menu.CheckboxItem className={cn('menu-item', className)} {...rest}>
      {Icon && <Icon size={18} aria-hidden="true" />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <Menu.ItemIndicator className="flex text-primary-text"><RiCheckLine size={18} className="text-primary-text!" /></Menu.ItemIndicator>
    </Menu.CheckboxItem>
  );
}

function RadioItem({ icon: Icon, className, children, ...rest }) {
  return (
    <Menu.RadioItem className={cn('menu-item', className)} {...rest}>
      {Icon && <Icon size={18} aria-hidden="true" />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <Menu.ItemIndicator className="flex"><RiCheckLine size={18} className="text-primary-text!" /></Menu.ItemIndicator>
    </Menu.RadioItem>
  );
}

function SubTrigger({ icon: Icon, className, children, ...rest }) {
  return (
    <Menu.SubTrigger className={cn('menu-item data-[state=open]:bg-bg-weak-50', className)} {...rest}>
      {Icon && <Icon size={18} aria-hidden="true" />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <RiArrowRightSLine size={18} aria-hidden="true" />
    </Menu.SubTrigger>
  );
}

function SubContent({ className, sideOffset = 8, style, ...rest }) {
  return (
    <Menu.Portal>
      <Menu.SubContent sideOffset={sideOffset} collisionPadding={8} className={cn(panel, 'min-w-[160px]', className)} style={{ ...origin, ...style }} {...rest} />
    </Menu.Portal>
  );
}

const Label = ({ className, ...rest }) => <Menu.Label className={cn('menu-label', className)} {...rest} />;
const Separator = ({ className, ...rest }) => <Menu.Separator className={cn('menu-sep', className)} {...rest} />;

export const Dropdown = {
  Root: Menu.Root, Trigger: Menu.Trigger, Group: Menu.Group, RadioGroup: Menu.RadioGroup, Sub: Menu.Sub,
  Content, Item, CheckItem, RadioItem, SubTrigger, SubContent, Label, Separator,
};
export default Dropdown;
