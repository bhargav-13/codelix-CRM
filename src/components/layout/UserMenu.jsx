// The account menu — the same one opens from the sidebar's user card and from
// the avatar in the top bar: View profile, Change password, Theme, Sign out.
//   <UserMenu side="top" align="start"><button>…</button></UserMenu>
import { useNavigate } from 'react-router-dom';
import { RiComputerLine, RiLockPasswordLine, RiLogoutBoxRLine, RiMoonLine, RiSunLine, RiUserLine } from '@remixicon/react';
import { useAuth } from '../../contexts/AuthContext';
import { Dropdown } from '../ui/Dropdown';
import { Avatar } from '../ui/Avatar';
import { useTheme } from '../ui/theme';
import { useMeSummary, useShell } from './shell';

const THEME_ICONS = { light: RiSunLine, dark: RiMoonLine, system: RiComputerLine };
const THEME_LABELS = { light: 'Light', dark: 'Dark', system: 'System' };

export default function UserMenu({ side = 'bottom', align = 'end', sideOffset = 8, children }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { openChangePassword } = useShell();
  const { theme, setTheme } = useTheme();
  const meInfo = useMeSummary();

  return (
    <Dropdown.Root modal={false}>
      <Dropdown.Trigger asChild>{children}</Dropdown.Trigger>
      <Dropdown.Content side={side} align={align} sideOffset={sideOffset} className="w-64">
        <div className="flex items-center gap-3 px-2 pb-2 pt-1.5">
          <Avatar name={meInfo.name} src={meInfo.avatarUrl} size={40} />
          <div className="min-w-0">
            <div className="truncate text-label-sm text-text-strong-950">{meInfo.name}</div>
            <div className="truncate text-paragraph-xs text-text-sub-600">{meInfo.email || meInfo.role}</div>
          </div>
        </div>
        <Dropdown.Separator />
        <Dropdown.Item icon={RiUserLine} onSelect={() => navigate('/profile')}>View profile</Dropdown.Item>
        <Dropdown.Item icon={RiLockPasswordLine} onSelect={() => requestAnimationFrame(openChangePassword)}>Change password</Dropdown.Item>
        <Dropdown.Separator />
        <Dropdown.Label>Theme</Dropdown.Label>
        <Dropdown.RadioGroup value={theme} onValueChange={setTheme}>
          {Object.keys(THEME_LABELS).map(t => (
            // keep the menu open so the change can be seen and undone
            <Dropdown.RadioItem key={t} value={t} icon={THEME_ICONS[t]} onSelect={e => e.preventDefault()}>{THEME_LABELS[t]}</Dropdown.RadioItem>
          ))}
        </Dropdown.RadioGroup>
        <Dropdown.Separator />
        <Dropdown.Item icon={RiLogoutBoxRLine} danger onSelect={() => logout()}>Sign out</Dropdown.Item>
      </Dropdown.Content>
    </Dropdown.Root>
  );
}
