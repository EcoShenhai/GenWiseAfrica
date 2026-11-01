import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Video, Award, Compass, Plus, Download, Share2 } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useApi, useAction, useTitle } from '../../lib/hooks';
import { patch, post, openFile } from '../../lib/api';
import { fmtDate, fmtDateTime, ROLE_LABEL, MEETING_LABEL } from '../../lib/format';
import { Alert, Avatar, Badge, Empty, Input, PageLoader, ProgressBar, SectionHeader, Spinner, Textarea, useToast } from '../../components/ui';

export function Home() {
  const { user, memberships } = useAuth();
  useTitle('My dashboard');
  const learning = useApi('/me/learning');
  const upcoming = useApi('/me/upcoming');
  const first = (user?.fullName || '').split(' ')[0];
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const active = memberships.filter((m) => m.status === 'active');
  const inProgress = (learning.data || []).filter((e) => !e.completedAt);
  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-5xl font-semibold text-night">{greet}, {first}</h1>
        <p className="mt-1 text-ink-muted">“Get wisdom, get understanding.” Proverbs 4:5</p>
      </div>

      {!active.length && (
        <div className="panel border-gold/40 bg-white p-8">
          <h2 className="font-display text-3xl font-semibold text-night">Begin by joining an academy</h2>
          <p className="mt-2 max-w-xl text-ink-muted">Academies are where courses, live classes, mentors and prayer groups live. Join your church’s academy or explore others.</p>
          <div className="mt-5 flex flex-wrap gap-3"><Link to="/academies" className="btn-primary"><Compass className="h-4 w-4" />Find an academy</Link><Link to="/start-academy" className="btn-outline"><Plus className="h-4 w-4" />Start an academy</Link></div>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <section>
          <h2 className="mb-4 font-display text-3xl font-semibold text-night">Continue learning</h2>
          {learning.loading ? <PageLoader /> : inProgress.length ? (
            <ul className="space-y-3">
              {inProgress.map((e) => (
                <li key={e.id}>
                  <Link to={`/app/a/${e.Course.Tenant.slug}/courses/${e.Course.slug}`} className="panel flex items-center gap-4 p-4 hover:border-gold/60">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-night text-gold"><BookOpen className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-night">{e.Course.title}</p>
                      <p className="mb-2 text-xs text-ink-muted">{e.Course.Tenant.name}</p>
                      <ProgressBar value={e.progressPct} />
                    </div>
                    <span className="text-sm font-semibold text-emerald">{e.progressPct}%</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <Empty icon={BookOpen} title="No courses in progress">Open an academy’s courses and enrol in one to begin.</Empty>}
        </section>
        <section>
          <h2 className="mb-4 font-display text-3xl font-semibold text-night">Coming up</h2>
          <div className="panel divide-y divide-dawn-200">
            {(upcoming.data || []).map((m) => (
              <Link key={m.id} to={`/app/a/${m.academy?.slug}/meetings/${m.id}`} className="flex gap-3 p-4 hover:bg-dawn/50">
                <Video className="mt-0.5 h-5 w-5 shrink-0 text-emerald" />
                <div><p className="font-medium text-night">{m.title}</p><p className="text-xs text-ink-muted">{MEETING_LABEL[m.type]}, {fmtDateTime(m.startsAt)}</p><p className="text-xs text-ink-soft">{m.academy?.name}</p></div>
              </Link>
            ))}
            {!upcoming.loading && !upcoming.data?.length && <p className="p-5 text-sm text-ink-muted">Nothing scheduled yet.</p>}
          </div>
        </section>
      </div>

      {active.length > 0 && (
        <section>
          <h2 className="mb-4 font-display text-3xl font-semibold text-night">My academies</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((m) => (
              <li key={m.tenant.id}>
                <Link to={`/app/a/${m.tenant.slug}`} className="panel flex items-center gap-4 p-5 hover:border-gold/60">
                  {m.tenant.logoUrl ? <img src={m.tenant.logoUrl} alt="" className="h-12 w-12 rounded-full object-cover" /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-night font-display text-xl font-bold text-gold">{m.tenant.name[0]}</span>}
                  <div className="min-w-0"><p className="truncate font-semibold text-night">{m.tenant.name}</p><p className="text-xs text-ink-muted">{ROLE_LABEL[m.role]}{m.tenant.status !== 'active' ? ' · awaiting approval' : ''}</p></div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function Certificates() {
  useTitle('Certificates');
  const { data, loading } = useApi('/me/certificates');
  const { toast, toastEl } = useToast();
  return (
    <div>
      <SectionHeader title="Certificates">Every course you complete earns a certificate anyone can verify.</SectionHeader>
      {loading ? <PageLoader /> : data?.length ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {data.map((c) => (
            <li key={c.id} className="panel relative overflow-hidden p-6">
              <div aria-hidden className="absolute -right-10 -top-10 h-32 w-32 rounded-full border border-gold/30" />
              <Award className="h-8 w-8 text-gold" />
              <h2 className="mt-3 font-display text-2xl font-semibold text-night">{c.Course?.title}</h2>
              <p className="text-sm text-ink-muted">{c.Tenant?.name}, issued {fmtDate(c.issuedAt)}</p>
              <p className="mt-1 font-mono text-xs text-ink-soft">{c.serial}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" className="btn-primary btn-sm" onClick={() => openFile(`/me/certificates/${c.id}/pdf`)}><Download className="h-3.5 w-3.5" />Download PDF</button>
                <button type="button" className="btn-outline btn-sm" onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/verify/${c.serial}`); toast('Verification link copied'); }}><Share2 className="h-3.5 w-3.5" />Copy verification link</button>
              </div>
            </li>
          ))}
        </ul>
      ) : <Empty icon={Award} title="No certificates yet">Finish a course, including its final assessment, to earn your first certificate.</Empty>}
      {toastEl}
    </div>
  );
}

export function Profile() {
  useTitle('Profile');
  const { user, reload } = useAuth();
  const [f, setF] = useState({ fullName: user.fullName || '', phone: user.phone || '', country: user.country || '', bio: user.bio || '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const a = useAction(); const b = useAction();
  const [msg, setMsg] = useState('');
  const save = (e) => { e.preventDefault(); a.run(async () => { await patch('/auth/me', f); await reload(); setMsg('Profile saved'); }).catch(() => {}); };
  const change = (e) => { e.preventDefault(); b.run(async () => { await post('/auth/change-password', pw); setPw({ currentPassword: '', newPassword: '' }); setMsg('Password changed. Other devices have been signed out.'); }).catch(() => {}); };
  return (
    <div className="max-w-2xl space-y-8">
      <SectionHeader title="Profile" />
      <Alert kind="success">{msg}</Alert>
      <form onSubmit={save} className="panel space-y-4 p-6">
        <div className="flex items-center gap-4"><Avatar name={user.fullName} src={user.avatarUrl} size={56} /><div><p className="font-semibold text-night">{user.email}</p><p className="text-sm text-ink-muted">{user.isSuperAdmin ? <Badge tone="night">Super admin</Badge> : 'Member'}</p></div></div>
        <Alert>{a.error}</Alert>
        <Input label="Full name" name="fullName" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Phone" name="phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <Input label="Country" name="country" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} />
        </div>
        <Textarea label="About me" name="bio" value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
        <button type="submit" className="btn-primary" disabled={a.busy}>{a.busy ? <Spinner className="text-white" /> : 'Save profile'}</button>
      </form>
      <form onSubmit={change} className="panel space-y-4 p-6">
        <h2 className="font-display text-2xl font-semibold text-night">Change password</h2>
        <Alert>{b.error}</Alert>
        <Input label="Current password" name="currentPassword" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
        <Input label="New password" name="newPassword" type="password" autoComplete="new-password" hint="At least 8 characters, including a letter and a number." value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
        <button type="submit" className="btn-outline" disabled={b.busy}>Change password</button>
      </form>
    </div>
  );
}
