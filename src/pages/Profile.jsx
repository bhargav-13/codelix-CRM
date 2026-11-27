// My profile (/profile): photo, personal details, account facts, security and
// appearance. Details save through profileAPI; the photo is cropped to a
// square (≤512px) in the browser, uploaded, then linked with { avatarFileId }.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  RiBriefcaseLine, RiCalendarLine, RiCameraLine, RiDeleteBinLine, RiExternalLinkLine, RiIdCardLine,
  RiLockPasswordLine, RiLogoutBoxRLine, RiMailLine, RiShieldKeyholeLine, RiShieldUserLine,
  RiUpload2Line, RiUserLine,
} from '@remixicon/react';
import Header from '../components/layout/Header';
import { useShell } from '../components/layout/shell';
import { InfoList, ProfileCard, ProfileHero, ProfileSkeleton, roleName } from '../components/layout/ProfileParts';
import { ErrorPanel, Field, FormGrid, fmtDate, todayLocal, useToast } from '../components/ui/kit';
import { Button } from '../components/ui/Button';
import { TextInput, Textarea } from '../components/ui/Input';
import { Dropdown } from '../components/ui/Dropdown';
import Badge from '../components/ui/Badge';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import ImageCropDialog, { IMAGE_TYPES, imageProblem } from '../components/ui/ImageCropDialog';
import { personPath } from '../components/ui/Person';
import { useAuth } from '../contexts/AuthContext';
import { profileAPI, refreshPeople } from '../lib/people';
import { uploadFile } from '../lib/files';
import BankDetailsCard from '../components/hr/BankDetailsCard';

const FIELDS = ['fullName', 'jobTitle', 'phone', 'dateOfBirth', 'address', 'emergencyContact', 'bio'];
const BIO_MAX = 500;

const toForm = p => Object.fromEntries(FIELDS.map(k => [k, k === 'dateOfBirth' ? String(p?.[k] || '').slice(0, 10) : p?.[k] ?? '']));

function validate(f) {
  const e = {};
  const name = f.fullName.trim();
  if (!name) e.fullName = 'Enter your full name.';
  else if (name.length < 2) e.fullName = 'That name is too short.';
  else if (name.length > 80) e.fullName = 'Keep your name under 80 characters.';
  if (f.jobTitle.trim().length > 80) e.jobTitle = 'Keep the job title under 80 characters.';
  const phone = f.phone.trim();
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    if (!/^[+\d][\d\s()-]*$/.test(phone) || digits.length < 7 || digits.length > 15) e.phone = 'Enter a valid phone number, for example +91 98765 43210.';
  }
  if (f.dateOfBirth) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.dateOfBirth)) e.dateOfBirth = 'Choose a date.';
    else if (f.dateOfBirth > todayLocal()) e.dateOfBirth = 'A date of birth cannot be in the future.';
    else if (f.dateOfBirth < '1900-01-01') e.dateOfBirth = 'Check the year.';
  }
  if (f.address.length > 300) e.address = 'Keep the address under 300 characters.';
  if (f.emergencyContact.length > 120) e.emergencyContact = 'Keep this under 120 characters.';
  if (f.bio.length > BIO_MAX) e.bio = `Keep your bio under ${BIO_MAX} characters.`;
  return e;
}

export default function Profile() {
  const { me, user, person, isPartner, logout, refreshMe } = useAuth();
  const { openChangePassword } = useShell();
  const toast = useToast();

  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(() => toForm(null));
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState(null);          // file waiting in the crop dialog
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const fileRef = useRef(null);
  const formRef = useRef(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const p = (await profileAPI.get()) || {};
      setProfile(p);
      setForm(toForm(p));
      setTouched({});
    } catch (e) { console.error(e); setLoadError(e); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const saved = useMemo(() => toForm(profile), [profile]);
  const changed = useMemo(() => FIELDS.filter(k => (form[k] ?? '').trim() !== (saved[k] ?? '').trim()), [form, saved]);
  const dirty = !!profile && changed.length > 0;
  const errors = useMemo(() => validate(form), [form]);
  const shown = key => (touched[key] ? errors[key] : undefined);   // an error appears once that field was left, or on Save

  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }));
  const blur = key => () => setTouched(t => (t[key] ? t : { ...t, [key]: true }));
  const bind = key => ({ value: form[key], onChange: set(key), onBlur: blur(key), hasError: !!shown(key), name: key });

  // after any change: my own card everywhere (sidebar, top bar, directory) follows
  const syncEverywhere = useCallback(() => { refreshMe?.(); refreshPeople(); }, [refreshMe]);

  const save = useCallback(async () => {
    if (saving || !dirty) return;
    setTouched(Object.fromEntries(FIELDS.map(k => [k, true])));
    const first = FIELDS.find(k => errors[k]);
    if (first) { formRef.current?.querySelector(`[name="${first}"]`)?.focus(); return; }
    setSaving(true);
    try {
      const patch = Object.fromEntries(changed.map(k => [k, form[k].trim() === '' ? null : form[k].trim()]));
      const updated = await profileAPI.update(patch);
      const next = updated && typeof updated === 'object' ? { ...profile, ...updated } : { ...profile, ...patch };
      setProfile(next);
      setForm(toForm(next));
      setTouched({});
      toast.success('Profile saved');
      syncEverywhere();
    } catch (e) {
      toast.error('Could not save your profile', e);
    } finally { setSaving(false); }
  }, [saving, dirty, errors, changed, form, profile, toast, syncEverywhere]);

  const discard = () => { setForm(saved); setTouched({}); };

  // unsaved changes: Ctrl/Cmd+S saves, and closing the tab asks first
  useEffect(() => {
    if (!dirty) return;
    const onKey = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } };
    const onLeave = e => { e.preventDefault(); e.returnValue = ''; };
    document.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onLeave);
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onLeave); };
  }, [dirty, save]);

  // ── photo ──
  function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';                               // picking the same file again still fires
    if (!file) return;
    const problem = imageProblem(file);
    if (problem) { toast.error(problem); return; }
    setPicked(file);
  }
  async function savePhoto(file) {
    const ownerId = me?.id || user?.id || profile?.id;
    const stored = await uploadFile(file, { module: 'profile', sourceId: ownerId });
    const updated = await profileAPI.update({ avatarFileId: stored.id });
    setProfile(p => ({ ...p, ...(updated && typeof updated === 'object' ? updated : {}), avatarFileId: stored.id, avatarUrl: (updated && updated.avatarUrl) || stored.url }));
    setPicked(null);
    toast.success('Photo updated');
    syncEverywhere();
  }
  async function removePhoto() {
    const updated = await profileAPI.update({ avatarFileId: null });
    setProfile(p => ({ ...p, ...(updated && typeof updated === 'object' ? updated : {}), avatarFileId: null, avatarUrl: null }));
    toast.success('Photo removed');
    syncEverywhere();
  }

  if (!profile) return (
    <div>
      <Header title="My profile" subtitle="Your photo and details, as the team sees them" />
      <div className="page-body">
        {loadError ? <ErrorPanel title="Could not load your profile" error={loadError} onRetry={load} /> : <ProfileSkeleton />}
      </div>
    </div>
  );

  const name = form.fullName.trim() || profile.fullName || me?.fullName || 'Your name';
  const email = profile.email || me?.email || user?.email || '';
  const role = roleName(profile.role ?? me?.role, isPartner ? 'Partner' : 'Employee');
  const hasPhoto = !!profile.avatarUrl;
  const publicPath = person?.id ? personPath(person) : null;

  return (
    <div>
      <Header title="My profile" subtitle="Your photo and details, as the team sees them"
        actions={publicPath && <Button asChild variant="neutral" mode="stroke" size="small"><Link to={publicPath}><RiExternalLinkLine size={16} aria-hidden="true" />View as others see it</Link></Button>} />

      <div className="page-body" style={{ paddingBottom: dirty ? 96 : undefined }}>
        <div className="profile-wrap">
          <ProfileHero
            name={name}
            avatarUrl={profile.avatarUrl}
            badges={<Badge color={isPartner ? 'blue' : 'gray'} icon={RiShieldUserLine}>{role}</Badge>}
            meta={<>
              {form.jobTitle.trim() && <span><RiBriefcaseLine size={16} aria-hidden="true" />{form.jobTitle.trim()}</span>}
              {email && <span><RiMailLine size={16} aria-hidden="true" /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</span></span>}
            </>}
            avatarOverlay={
              <Dropdown.Root modal={false}>
                <Dropdown.Trigger asChild>
                  <button type="button" className="profile-avatar-btn" aria-label="Change photo"><RiCameraLine size={16} aria-hidden="true" /></button>
                </Dropdown.Trigger>
                <Dropdown.Content align="start" sideOffset={8}>
                  <Dropdown.Item icon={RiUpload2Line} onSelect={() => fileRef.current?.click()}>{hasPhoto ? 'Upload a new photo' : 'Upload a photo'}</Dropdown.Item>
                  {hasPhoto && <Dropdown.Item icon={RiDeleteBinLine} danger onSelect={() => requestAnimationFrame(() => setConfirmRemove(true))}>Remove photo</Dropdown.Item>}
                </Dropdown.Content>
              </Dropdown.Root>
            }
            actions={<>
              <Button variant="neutral" mode="stroke" size="small" leftIcon={RiCameraLine} onClick={() => fileRef.current?.click()}>Change photo</Button>
              {hasPhoto && <Button variant="neutral" mode="ghost" size="small" onClick={() => setConfirmRemove(true)}>Remove</Button>}
            </>}
          />
          <input ref={fileRef} type="file" accept={IMAGE_TYPES.join(',')} onChange={onPick} hidden aria-hidden="true" tabIndex={-1} />

          <div className="profile-grid">
            {/* Editable details */}
            <ProfileCard icon={RiUserLine} title="Personal details" sub="Keep these up to date so the team can reach you.">
              <form ref={formRef} onSubmit={e => { e.preventDefault(); save(); }} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <FormGrid cols={2}>
                  <Field label="Full name" required error={shown('fullName')}>
                    {id => <TextInput id={id} autoComplete="name" maxLength={100} {...bind('fullName')} />}
                  </Field>
                  <Field label="Job title" error={shown('jobTitle')} hint="For example: Frontend developer">
                    {id => <TextInput id={id} autoComplete="organization-title" maxLength={100} {...bind('jobTitle')} />}
                  </Field>
                  <Field label="Phone" error={shown('phone')}>
                    {id => <TextInput id={id} type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" {...bind('phone')} />}
                  </Field>
                  <Field label="Date of birth" error={shown('dateOfBirth')}>
                    {id => <TextInput id={id} type="date" max={todayLocal()} min="1900-01-01" autoComplete="bday" {...bind('dateOfBirth')} />}
                  </Field>
                  <Field label="Emergency contact" error={shown('emergencyContact')} hint="Name, relation and phone number" span={2}>
                    {id => <TextInput id={id} maxLength={140} placeholder="Asha Rao (sister) · +91 98765 43210" {...bind('emergencyContact')} />}
                  </Field>
                  <Field label="Address" error={shown('address')} span={2}>
                    {id => <Textarea id={id} rows={2} autoComplete="street-address" className="min-h-[68px]" {...bind('address')} />}
                  </Field>
                  <Field label="Bio" error={shown('bio')} span={2}
                    hint={<span style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>A line or two about what you do.</span><span className="tabular" style={{ color: form.bio.length > BIO_MAX ? 'var(--bad)' : undefined }}>{form.bio.length}/{BIO_MAX}</span></span>}>
                    {id => <Textarea id={id} rows={4} {...bind('bio')} />}
                  </Field>
                </FormGrid>
                {/* Enter in a field saves; the visible buttons are in the bar below */}
                <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
              </form>
            </ProfileCard>

            <div className="profile-side">
              <ProfileCard icon={RiIdCardLine} title="Account" sub="Set by a partner — ask one to change these.">
                <InfoList rows={[
                  { icon: RiMailLine, label: 'Email', value: email },
                  { icon: RiShieldUserLine, label: 'Role', value: role },
                  { icon: RiCalendarLine, label: 'Joined', value: profile.joinedOn ? fmtDate(profile.joinedOn) : '' },
                ]} />
              </ProfileCard>

              {!isPartner && <BankDetailsCard />}

              <ProfileCard icon={RiShieldKeyholeLine} title="Security" sub="Your password and this device's session.">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Button variant="neutral" mode="stroke" size="small" leftIcon={RiLockPasswordLine} onClick={openChangePassword} className="justify-start">Change password</Button>
                  <Button variant="error" mode="lighter" size="small" leftIcon={RiLogoutBoxRLine} loading={signingOut} loadingText="Signing out…" className="justify-start"
                    onClick={() => { setSigningOut(true); logout(); }}>Sign out</Button>
                </div>
              </ProfileCard>
            </div>
          </div>
        </div>
      </div>

      {/* Appears only while something is unsaved */}
      {dirty && (
        <div className="save-bar" role="region" aria-label="Unsaved changes">
          <span className="save-bar-text"><span className="save-bar-dot" aria-hidden="true" /><span>Unsaved changes</span></span>
          <Button variant="neutral" mode="ghost" size="xsmall" onClick={discard} disabled={saving} className="text-static-white/80 hover:bg-white-alpha-16 hover:text-static-white disabled:bg-transparent disabled:text-white-alpha-24">Discard</Button>
          <Button size="xsmall" onClick={save} loading={saving} loadingText="Saving…">Save changes</Button>
        </div>
      )}

      <ImageCropDialog file={picked} onCancel={() => setPicked(null)} onConfirm={savePhoto} />
      <ConfirmDialog isOpen={confirmRemove} onClose={() => setConfirmRemove(false)} onConfirm={removePhoto}
        title="Remove your photo?" message="Your initials will be shown instead. You can upload a new photo at any time." confirmLabel="Remove photo" />
    </div>
  );
}
