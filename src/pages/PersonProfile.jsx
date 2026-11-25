// Someone's profile (/people/:kind/:id) — the page every avatar, name and
// person chip in the app links to. Same header as "My profile", with ways to
// reach them; partners also get shortcuts to the employee's record and tasks.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  RiArrowLeftLine, RiBriefcaseLine, RiCalendarLine, RiKanbanView, RiMailLine, RiMessage2Line, RiPencilLine,
  RiPhoneLine, RiShieldUserLine, RiTeamLine, RiUserLine, RiUserSearchLine, RiArrowRightSLine, RiContactsLine,
} from '@remixicon/react';
import Header from '../components/layout/Header';
import { InfoList, ProfileCard, ProfileHero, ProfileSkeleton, roleName } from '../components/layout/ProfileParts';
import { EmptyPanel, ErrorPanel, fmtDate } from '../components/ui/kit';
import { Button } from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { useAuth } from '../contexts/AuthContext';
import { peopleAPI, usePeople, roleLabel } from '../lib/people';

const telHref = phone => `tel:${String(phone).replace(/[^\d+]/g, '')}`;

function QuickLink({ to, icon: Icon, title, text }) {
  return (
    <Link to={to} className="mac-card card-link" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 'var(--r-md)', boxShadow: 'none' }}>
      <span className="profile-card-icon"><Icon size={18} aria-hidden="true" /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{title}</span>
        <span className="muted" style={{ display: 'block', fontSize: 12.5 }}>{text}</span>
      </span>
      <RiArrowRightSLine size={18} aria-hidden="true" style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
    </Link>
  );
}

export default function PersonProfile() {
  const { kind, id } = useParams();
  const navigate = useNavigate();
  const { isPartner, isEmployee, can, person: mine } = useAuth();
  const { byKey, loading: directoryLoading } = usePeople();
  const [state, setState] = useState({ key: null, person: null, error: null });
  const key = `${kind}:${id}`;

  const load = useCallback(async () => {
    try {
      const person = await peopleAPI.get(kind, id);
      setState({ key: `${kind}:${id}`, person: person || null, error: null });
    } catch (error) {
      console.error(error);
      setState({ key: `${kind}:${id}`, person: null, error });
    }
  }, [kind, id]);
  useEffect(() => { load(); }, [load]);

  const fetched = state.key === key;                    // the answer on screen belongs to this URL
  const listed = byKey.get(key);                        // what the shared directory already knows
  const person = fetched && state.person ? { ...listed, ...state.person } : listed || null;
  const error = fetched ? state.error : null;
  const waiting = !person && !error && (!fetched || directoryLoading);
  const missing = !person && !waiting && (!error || error.status === 404);

  const back = (
    <Button variant="neutral" mode="stroke" size="small" leftIcon={RiArrowLeftLine} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>Back</Button>
  );

  if (!person) return (
    <div>
      <Header title="Profile" subtitle="People at Codelix" actions={back} />
      <div className="page-body">
        {waiting ? <ProfileSkeleton />
          : missing ? <EmptyPanel icon={RiUserSearchLine} title="This person could not be found" text="They may have left, or the link is out of date." action={back} />
          : <ErrorPanel title="Could not load this profile" error={error} onRetry={() => { setState({ key: null, person: null, error: null }); load(); }} />}
      </div>
    </div>
  );

  const isMe = !!mine && mine.kind === person.kind && String(mine.id) === String(person.id);
  const firstName = (person.name || '').trim().split(/\s+/)[0] || 'them';
  const role = person.kind === 'partner' ? 'Partner' : roleName(person.role, 'Employee');
  const canChat = !isMe && (!isEmployee || can('chat'));
  const employeeId = person.kind === 'employee' ? person.employeeId || person.id : person.employeeId;
  const chatState = { startWith: { kind: person.kind, id: person.id, name: person.name } };

  return (
    <div>
      <Header title="Profile" subtitle={person.name} actions={back} />
      <div className="page-body">
        <div className="profile-wrap">
          <ProfileHero
            name={person.name}
            avatarUrl={person.avatarUrl}
            badges={<>
              <Badge color={person.kind === 'partner' ? 'blue' : 'gray'} icon={RiShieldUserLine}>{role}</Badge>
              {person.active === false && <Badge color="orange" dot>Inactive</Badge>}
            </>}
            meta={<>
              {(person.jobTitle || person.kind === 'employee') && <span><RiBriefcaseLine size={16} aria-hidden="true" />{roleLabel(person)}</span>}
              {person.email && <span><RiMailLine size={16} aria-hidden="true" /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{person.email}</span></span>}
            </>}
            actions={isMe
              ? <Button asChild size="small"><Link to="/profile"><RiPencilLine size={16} aria-hidden="true" />Edit my profile</Link></Button>
              : <>
                {canChat && <Button asChild size="small"><Link to="/chat" state={chatState}><RiMessage2Line size={16} aria-hidden="true" />Message</Link></Button>}
                {person.phone && <Button asChild variant="neutral" mode="stroke" size="small"><a href={telHref(person.phone)}><RiPhoneLine size={16} aria-hidden="true" />Call</a></Button>}
                {person.email && <Button asChild variant="neutral" mode="stroke" size="small"><a href={`mailto:${person.email}`}><RiMailLine size={16} aria-hidden="true" />Email</a></Button>}
              </>}
          />

          {error && <div className="auth-alert" role="status">Showing what the directory has — the full profile could not be loaded just now.</div>}

          <div className="profile-grid">
            <div className="profile-side">
              <ProfileCard icon={RiUserLine} title={`About ${firstName}`}>
                {person.bio
                  ? <p style={{ fontSize: 14, lineHeight: '22px', color: 'var(--ink-2)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{person.bio}</p>
                  : <p className="faint" style={{ fontSize: 14 }}>{isMe ? 'Add a short bio from your profile so the team knows what you do.' : `${firstName} has not added a bio yet.`}</p>}
              </ProfileCard>

              {isPartner && !isMe && employeeId && (
                <ProfileCard icon={RiTeamLine} title="For partners" sub="Open this person elsewhere in the app.">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <QuickLink to={`/employees?employee=${encodeURIComponent(employeeId)}`} icon={RiTeamLine} title="Employee record" text="Opens the Employees page" />
                    <QuickLink to={`/tasks?assignee=${encodeURIComponent(`employee:${employeeId}`)}`} icon={RiKanbanView} title="Tasks" text="Opens the Work page" />
                  </div>
                </ProfileCard>
              )}
            </div>

            <ProfileCard icon={RiContactsLine} title="Contact and details">
              <InfoList rows={[
                { icon: RiMailLine, label: 'Email', value: person.email, href: person.email ? `mailto:${person.email}` : undefined },
                { icon: RiPhoneLine, label: 'Phone', value: person.phone, href: person.phone ? telHref(person.phone) : undefined },
                { icon: RiBriefcaseLine, label: 'Job title', value: person.jobTitle },
                { icon: RiShieldUserLine, label: 'Role', value: role },
                person.joinedOn && { icon: RiCalendarLine, label: 'Joined', value: fmtDate(person.joinedOn) },
              ]} />
            </ProfileCard>
          </div>
        </div>
      </div>
    </div>
  );
}
