import { useState } from 'react';
import { Users, BookOpen, Award, Video, HeartHandshake, Smartphone, Megaphone, Trash2 } from 'lucide-react';
import { useApi, useAction, useTitle } from '../../lib/hooks';
import { post, patch, del } from '../../lib/api';
import { fmtDate, fmtKes, ROLE_LABEL, TYPE_LABEL, ago } from '../../lib/format';
import { Alert, Avatar, Badge, Empty, Input, PageLoader, SectionHeader, Select, Spinner, Tabs, Textarea, useToast } from '../../components/ui';
import { useAcademy } from './AcademyContext';
import { UploadButton } from './Studio';

const ROLE_OPTIONS = Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }));

function Dashboard() {
  const { slug } = useAcademy();
  const { data } = useApi(`/t/${slug}/dashboard`);
  if (!data) return <PageLoader />;
  const stats = [
    { icon: Users, label: 'Active members', value: data.members, note: data.pending ? `${data.pending} waiting for approval` : null },
    { icon: BookOpen, label: 'Enrolments', value: data.enrollments, note: `${data.completions} completed across ${data.courses} courses` },
    { icon: Award, label: 'Certificates issued', value: data.certificates },
    { icon: Video, label: 'Upcoming meetings', value: data.upcomingMeetings },
    { icon: HeartHandshake, label: 'Active mentorships', value: data.activeMentorships },
  ];
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stats.map(({ icon: Icon, label, value, note }) => (
        <div key={label} className="panel p-5"><dt className="flex items-center gap-2 text-sm text-ink-muted"><Icon className="h-4 w-4 text-gold-deep" />{label}</dt><dd className="mt-2 font-display text-4xl font-semibold text-night">{value}</dd>{note && <p className="mt-1 text-xs text-ink-muted">{note}</p>}</div>
      ))}
    </dl>
  );
}

function Members() {
  const { slug, membership } = useAcademy();
  const [status, setStatus] = useState('active');
  const { data, loading, reload } = useApi(`/t/${slug}/members?status=${status}`, [status]);
  const [add, setAdd] = useState({ email: '', role: 'instructor' });
  const { error, run, busy } = useAction();
  const { toast, toastEl } = useToast();
  const update = (m, body) => run(async () => { await patch(`/t/${slug}/members/${m.id}`, body); reload(); toast('Member updated'); }).catch(() => {});
  return (
    <div className="space-y-5">
      <form className="panel grid gap-3 p-5 sm:grid-cols-[2fr_1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); run(async () => { await post(`/t/${slug}/members/add`, add); setAdd({ ...add, email: '' }); reload(); toast('Member added'); }).catch(() => {}); }}>
        <Input label="Add someone by email" name="addemail" type="email" required placeholder="They need a GenWise account" value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} />
        <Select label="Role" name="addrole" value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })} options={ROLE_OPTIONS.filter((r) => r.value !== 'owner')} />
        <button type="submit" className="btn-primary" disabled={busy}>Add member</button>
      </form>
      <Alert>{error}</Alert>
      <div className="flex gap-2">{['active', 'pending', 'removed'].map((s) => <button key={s} type="button" onClick={() => setStatus(s)} className={`chip ${status === s ? 'bg-night text-gold-light' : 'bg-white text-ink-muted border border-dawn-200'}`}>{s}</button>)}</div>
      {loading ? <PageLoader /> : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-dawn-200 text-left text-ink-muted"><th className="px-4 py-3">Member</th><th>Role</th><th>Joined</th><th className="px-4 text-right">Actions</th></tr></thead>
            <tbody>
              {(data || []).map((m) => (
                <tr key={m.id} className="border-b border-dawn-200 last:border-0">
                  <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={m.User.fullName} src={m.User.avatarUrl} size={32} /><div><p className="font-medium text-night">{m.User.fullName}</p><p className="text-xs text-ink-muted">{m.User.email}{m.User.phone ? ` · ${m.User.phone}` : ''}</p></div></div></td>
                  <td><select className="input w-auto py-1 text-sm" value={m.role} disabled={m.role === 'owner' && membership?.role !== 'owner'} onChange={(e) => update(m, { role: e.target.value })} aria-label={`Role for ${m.User.fullName}`}>{ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></td>
                  <td className="text-ink-muted">{fmtDate(m.createdAt)}</td>
                  <td className="px-4 text-right">
                    {m.status === 'pending' && <><button type="button" className="btn-primary btn-sm mr-1" onClick={() => update(m, { status: 'active' })}>Approve</button><button type="button" className="btn-ghost btn-sm" onClick={() => update(m, { status: 'removed' })}>Decline</button></>}
                    {m.status === 'active' && m.role !== 'owner' && <button type="button" className="btn-ghost btn-sm text-red-700" onClick={() => { if (window.confirm(`Remove ${m.User.fullName}?`)) update(m, { status: 'removed' }); }}>Remove</button>}
                    {m.status === 'removed' && <button type="button" className="btn-ghost btn-sm" onClick={() => update(m, { status: 'active' })}>Restore</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.length && <p className="p-6 text-center text-sm text-ink-muted">No {status} members.</p>}
        </div>
      )}
      {toastEl}
    </div>
  );
}

function Settings() {
  const { academy, slug, reload } = useAcademy();
  const [f, setF] = useState({ ...academy });
  const { busy, error, run } = useAction();
  const [ok, setOk] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="panel max-w-3xl space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); run(async () => { await patch(`/t/${slug}/settings`, f); await reload(); setOk('Settings saved'); }).catch(() => {}); }}>
      <Alert>{error}</Alert><Alert kind="success">{ok}</Alert>
      <div className="flex flex-wrap items-center gap-4">{f.logoUrl ? <img src={f.logoUrl} alt="" className="h-16 w-16 rounded-full object-cover" /> : <span className="flex h-16 w-16 items-center justify-center rounded-full bg-night font-display text-2xl font-bold text-gold">{f.name?.[0]}</span>}<UploadButton kind="image" label="Upload logo" onUploaded={(url) => setF((x) => ({ ...x, logoUrl: url }))} /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Academy name" name="name" value={f.name} onChange={set('name')} />
        <Select label="Type" name="type" value={f.type} onChange={set('type')} options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
      </div>
      <Input label="Tagline" name="tagline" value={f.tagline || ''} onChange={set('tagline')} />
      <Textarea label="About" name="about" rows={4} value={f.about || ''} onChange={set('about')} />
      <Input label="Welcome verse" name="welcomeVerse" placeholder="Shown on your academy home" value={f.welcomeVerse || ''} onChange={set('welcomeVerse')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="City" name="city" value={f.city || ''} onChange={set('city')} />
        <Input label="Country" name="country" value={f.country || ''} onChange={set('country')} />
        <Input label="Denomination" name="denomination" value={f.denomination || ''} onChange={set('denomination')} />
        <Input label="Website" name="website" value={f.website || ''} onChange={set('website')} />
        <Input label="Contact email" name="contactEmail" type="email" value={f.contactEmail || ''} onChange={set('contactEmail')} />
        <Input label="Contact phone" name="contactPhone" value={f.contactPhone || ''} onChange={set('contactPhone')} />
      </div>
      <Select label="Who can join" name="joinPolicy" value={f.joinPolicy} onChange={set('joinPolicy')} options={[{ value: 'open', label: 'Anyone can join instantly' }, { value: 'approval', label: 'Admins approve each new member' }]} />
      <p className="text-sm text-ink-muted">Your public page: <a className="link" href={`/a/${slug}`}>{window.location.origin}/a/{slug}</a></p>
      <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Save settings'}</button>
    </form>
  );
}

function Announcements() {
  const { slug } = useAcademy();
  const { data, reload } = useApi(`/t/${slug}/announcements`);
  const [f, setF] = useState({ title: '', body: '' });
  const { busy, error, run } = useAction();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form className="panel h-fit space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); run(async () => { await post(`/t/${slug}/announcements`, f); setF({ title: '', body: '' }); reload(); }).catch(() => {}); }}>
        <h2 className="font-display text-2xl font-semibold text-night">Post an announcement</h2>
        <Alert>{error}</Alert>
        <Input label="Title" name="atitle" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Textarea label="Message" name="abody" rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        <p className="text-xs text-ink-muted">Every member gets an in-app notification.</p>
        <button type="submit" className="btn-primary" disabled={busy}><Megaphone className="h-4 w-4" />Post</button>
      </form>
      <ul className="space-y-3">{(data || []).map((a) => <li key={a.id} className="panel p-4"><div className="flex justify-between gap-3"><p className="font-semibold text-night">{a.title}</p><button type="button" aria-label="Delete announcement" className="text-ink-soft hover:text-red-600" onClick={async () => { await del(`/t/${slug}/announcements/${a.id}`); reload(); }}><Trash2 className="h-4 w-4" /></button></div>{a.body && <p className="mt-1 whitespace-pre-line text-sm text-ink">{a.body}</p>}<p className="mt-1 text-xs text-ink-muted">{ago(a.publishedAt)}</p></li>)}</ul>
    </div>
  );
}

function Billing() {
  const { slug } = useAcademy();
  const { data, loading, reload } = useApi(`/t/${slug}/billing`);
  const [f, setF] = useState({ planCode: '', amountKes: '', mpesaCode: '', payerPhone: '', payerName: '' });
  const { busy, error, run } = useAction();
  const [ok, setOk] = useState('');
  if (loading || !data) return <PageLoader />;
  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-6">
        <div className="panel p-6">
          <p className="text-sm text-ink-muted">Current plan</p>
          <p className="font-display text-4xl font-semibold capitalize text-night">{data.currentPlan}</p>
          {data.renewsAt && <p className="text-sm text-ink-muted">Supported until {fmtDate(data.renewsAt)}</p>}
          <p className="mt-3 text-sm text-ink">GenWise Africa is free for every academy during our launch. Every feature is already included.</p>
        </div>
        <div className="rounded-2xl bg-night p-6 text-dawn">
          <p className="flex items-center gap-2 text-gold-light"><Smartphone className="h-5 w-5" />Give by M-Pesa</p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-dawn/85">
            <li>Open M-Pesa and choose <b>Send Money</b>.</li>
            <li>Send any amount to <b className="font-display text-xl text-gold-light">{data.mpesa.display}</b> ({data.mpesa.receiver}).</li>
            <li>Enter the transaction code from the confirmation SMS in the form here. A GenWise administrator will confirm it.</li>
          </ol>
        </div>
        <div>
          <h3 className="mb-3 font-display text-2xl font-semibold text-night">Payment history</h3>
          <ul className="panel divide-y divide-dawn-200">
            {data.payments.map((p) => <li key={p.id} className="flex items-center justify-between gap-3 p-4 text-sm"><div><p className="font-medium text-night">{fmtKes(p.amountKes)} · {p.mpesaCode}</p><p className="text-xs text-ink-muted">{fmtDate(p.createdAt)} · {p.kind}{p.planCode ? ` (${p.planCode})` : ''}</p></div><Badge tone={p.status === 'approved' ? 'emerald' : p.status === 'rejected' ? 'red' : 'gold'}>{p.status}</Badge></li>)}
            {!data.payments.length && <li className="p-5 text-sm text-ink-muted">No payments yet.</li>}
          </ul>
        </div>
      </div>
      <form className="panel h-fit space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); run(async () => { await post(`/t/${slug}/payments`, f); setF({ planCode: '', amountKes: '', mpesaCode: '', payerPhone: '', payerName: '' }); setOk('Thank you. We will confirm your M-Pesa payment shortly.'); reload(); }).catch(() => {}); }}>
        <h3 className="font-display text-2xl font-semibold text-night">I have sent money</h3>
        <Alert>{error}</Alert><Alert kind="success">{ok}</Alert>
        <Select label="What is it for?" name="planCode" value={f.planCode} onChange={(e) => setF({ ...f, planCode: e.target.value })} options={[{ value: '', label: 'A gift to support the mission' }, ...data.plans.filter((p) => p.code !== 'free').map((p) => ({ value: p.code, label: `${p.name} plan: ${p.tagline}` }))]} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Amount (KES)" name="amountKes" type="number" min="1" required value={f.amountKes} onChange={(e) => setF({ ...f, amountKes: e.target.value })} />
          <Input label="M-Pesa code" name="mpesaCode" required placeholder="e.g. SJK3ABC12X" value={f.mpesaCode} onChange={(e) => setF({ ...f, mpesaCode: e.target.value.toUpperCase() })} />
          <Input label="Phone that paid" name="payerPhone" type="tel" value={f.payerPhone} onChange={(e) => setF({ ...f, payerPhone: e.target.value })} />
          <Input label="Name on M-Pesa" name="payerName" value={f.payerName} onChange={(e) => setF({ ...f, payerName: e.target.value })} />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy}>Submit for confirmation</button>
      </form>
    </div>
  );
}

export default function Manage() {
  const { caps, academy } = useAcademy();
  const [tab, setTab] = useState('overview');
  useTitle(`Manage ${academy.name}`);
  if (!caps.manage) return <Empty title="Admins only">Only academy owners and admins can manage the academy.</Empty>;
  return (
    <div>
      <SectionHeader title="Manage academy">{academy.name}</SectionHeader>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'overview', label: 'Overview' }, { value: 'members', label: 'Members' }, { value: 'announce', label: 'Announcements' }, { value: 'settings', label: 'Settings' }, { value: 'billing', label: 'Billing & giving' }]} />
      {tab === 'overview' && <Dashboard />}
      {tab === 'members' && <Members />}
      {tab === 'announce' && <Announcements />}
      {tab === 'settings' && <Settings />}
      {tab === 'billing' && <Billing />}
    </div>
  );
}
