import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Search, MapPin, BookOpen, Mic2, Video, Users, ShieldCheck, ShieldX, Clock } from 'lucide-react';
import { useApi, useAction, useTitle } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { post, get } from '../lib/api';
import { fmtDate, fmtDateTime, TYPE_LABEL, MEETING_LABEL } from '../lib/format';
import { Alert, Avatar, Empty, Input, PageLoader, Select, Spinner, Textarea } from '../components/ui';

/* ------------------------------------------------------------------ directory */
export function Academies() {
  useTitle('Academies');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const { data, loading } = useApi(`/public/academies?q=${encodeURIComponent(q)}&type=${type}`, [q, type]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-5xl font-semibold text-night">Find an academy</h1>
      <p className="mt-2 max-w-xl text-ink-muted">Churches, ministries and mentors teaching on GenWise Africa. Join one to start learning.</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search academies</span>
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input className="input pl-10" placeholder="Search by name or city" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="input sm:w-56" value={type} onChange={(e) => setType(e.target.value)} aria-label="Academy type">
          <option value="">All types</option>
          {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {loading ? <PageLoader /> : (
        <ul className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {(data || []).map((a) => (
            <li key={a.id}>
              <Link to={`/a/${a.slug}`} className="panel flex h-full flex-col p-6 transition-colors hover:border-gold/60">
                <div className="flex items-center gap-4">
                  {a.logoUrl ? <img src={a.logoUrl} alt="" className="h-14 w-14 rounded-full object-cover" /> : <span className="flex h-14 w-14 items-center justify-center rounded-full bg-night font-display text-2xl font-bold text-gold">{a.name[0]}</span>}
                  <div className="min-w-0"><h2 className="font-display text-2xl font-semibold leading-tight text-night">{a.name}</h2><p className="text-sm text-ink-muted">{TYPE_LABEL[a.type]}</p></div>
                </div>
                {a.tagline && <p className="mt-4 text-ink-muted">{a.tagline}</p>}
                <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-5 text-sm text-ink-muted">
                  {(a.city || a.country) && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{[a.city, a.country].filter(Boolean).join(', ')}</span>}
                  <span className="inline-flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{a.courseCount} courses</span>
                  <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{a.memberCount} members</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!loading && !data?.length && <div className="mt-10"><Empty icon={Search} title="No academies match">Try another name or city, or start your own academy.</Empty></div>}
    </div>
  );
}

/* ------------------------------------------------------------------ academy public page */
export function AcademyPublic() {
  const { slug } = useParams();
  const nav = useNavigate();
  const { user, membershipFor, reload } = useAuth();
  const { data, loading, error } = useApi(`/public/academies/${slug}`);
  const { busy, error: joinErr, run } = useAction();
  useTitle(data?.academy?.name);
  if (loading) return <PageLoader />;
  if (error) return <div className="mx-auto max-w-3xl px-4 py-20"><Empty title="Academy not found">This academy may not be open yet.</Empty></div>;
  const { academy: a, courses, podcasts, meetings, mentors, prayerGroups, memberCount } = data;
  const mem = membershipFor(slug);
  const join = () => {
    if (!user) { nav(`/register?academy=${slug}`); return; }
    run(async () => { await post(`/t/${slug}/join`); await reload(); nav(`/app/a/${slug}`); }).catch(() => {});
  };
  return (
    <>
      <section className="bg-night text-dawn">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            {a.logoUrl ? <img src={a.logoUrl} alt="" className="h-24 w-24 rounded-full object-cover ring-2 ring-gold/50" /> : <span className="flex h-24 w-24 items-center justify-center rounded-full bg-gold/15 font-display text-5xl font-bold text-gold">{a.name[0]}</span>}
            <div className="flex-1">
              <p className="text-sm text-gold-light">{TYPE_LABEL[a.type]}{a.city ? `, ${a.city}` : ''}{a.denomination ? ` (${a.denomination})` : ''}</p>
              <h1 className="font-display text-5xl font-semibold text-dawn">{a.name}</h1>
              {a.tagline && <p className="mt-2 text-lg text-dawn/75">{a.tagline}</p>}
            </div>
            <div className="flex flex-col items-start gap-2">
              {mem?.status === 'active' ? <Link to={`/app/a/${slug}`} className="btn-gold">Open academy</Link>
                : mem?.status === 'pending' ? <span className="chip bg-gold/15 text-gold-light">Membership request pending</span>
                  : <button type="button" className="btn-gold" onClick={join} disabled={busy}>{busy ? <Spinner /> : a.joinPolicy === 'open' ? 'Join this academy' : 'Request to join'}</button>}
              <span className="text-sm text-dawn/60">{memberCount} members</span>
            </div>
          </div>
          {joinErr && <div className="mt-4"><Alert>{joinErr}</Alert></div>}
        </div>
      </section>
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-12">
          {(a.about || a.welcomeVerse) && (
            <section>
              {a.welcomeVerse && <blockquote className="border-l-2 border-gold pl-4 font-display text-2xl italic text-night">{a.welcomeVerse}</blockquote>}
              {a.about && <p className="mt-5 whitespace-pre-line text-lg text-ink-muted">{a.about}</p>}
            </section>
          )}
          <section>
            <h2 className="font-display text-3xl font-semibold text-night">Courses</h2>
            <div className="mt-5 divide-y divide-dawn-200 border-y border-dawn-200">
              {courses.map((c) => (
                <div key={c.id} className="py-5">
                  <p className="text-xs text-ink-muted">{c.category} · {c.level}</p>
                  <h3 className="font-display text-2xl font-semibold text-night">{c.title}</h3>
                  {c.summary && <p className="mt-1 text-ink-muted">{c.summary}</p>}
                  {c.instructor && <p className="mt-2 flex items-center gap-2 text-sm text-ink-muted"><Avatar name={c.instructor.fullName} src={c.instructor.avatarUrl} size={22} />{c.instructor.fullName}</p>}
                </div>
              ))}
              {!courses.length && <p className="py-5 text-ink-muted">Courses are being prepared.</p>}
            </div>
          </section>
          {podcasts.length > 0 && (
            <section>
              <h2 className="font-display text-3xl font-semibold text-night">Podcasts</h2>
              <ul className="mt-4 space-y-3">{podcasts.map((p) => <li key={p.id} className="flex gap-3"><Mic2 className="mt-1 h-5 w-5 text-gold-deep" /><div><p className="font-semibold text-night">{p.title}</p><p className="text-sm text-ink-muted">{p.description}</p></div></li>)}</ul>
            </section>
          )}
        </div>
        <aside className="space-y-8">
          <section className="panel p-6">
            <h2 className="font-display text-2xl font-semibold text-night">Upcoming</h2>
            <ul className="mt-3 space-y-3">
              {meetings.map((m) => <li key={m.id} className="flex gap-3"><Video className="mt-0.5 h-5 w-5 text-emerald" /><div><p className="font-medium text-night">{m.title}</p><p className="text-sm text-ink-muted">{MEETING_LABEL[m.type]}, {fmtDateTime(m.startsAt)}</p></div></li>)}
              {!meetings.length && <li className="text-sm text-ink-muted">No public events scheduled.</li>}
            </ul>
          </section>
          {mentors.length > 0 && (
            <section className="panel p-6">
              <h2 className="font-display text-2xl font-semibold text-night">Mentors</h2>
              <ul className="mt-3 space-y-3">{mentors.map((m, i) => <li key={i} className="flex items-center gap-3"><Avatar name={m.User?.fullName} src={m.User?.avatarUrl} size={34} /><div><p className="font-medium text-night">{m.User?.fullName}</p><p className="text-xs text-ink-muted">{m.headline}</p></div></li>)}</ul>
            </section>
          )}
          {prayerGroups.length > 0 && (
            <section className="panel p-6">
              <h2 className="font-display text-2xl font-semibold text-night">Prayer groups</h2>
              <ul className="mt-3 space-y-2">{prayerGroups.map((g) => <li key={g.name}><p className="font-medium text-night">{g.name}</p>{g.schedule && <p className="text-xs text-ink-muted">{g.schedule}</p>}</li>)}</ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ start academy */
export function StartAcademy() {
  useTitle('Start an academy');
  const nav = useNavigate();
  const { user, reload } = useAuth();
  const { busy, error, run } = useAction();
  const [f, setF] = useState({ name: '', type: 'church', tagline: '', about: '', city: '', country: 'Kenya', denomination: '', contactPhone: '' });
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
        <h1 className="font-display text-5xl font-semibold text-night">Start your academy</h1>
        <p className="mt-4 text-lg text-ink-muted">Create a free GenWise account first. You will be the owner of your academy and can invite your team afterwards.</p>
        <div className="mt-8 flex justify-center gap-3"><Link to="/register?next=/start-academy" className="btn-primary">Create account</Link><Link to="/login?next=/start-academy" className="btn-outline">Sign in</Link></div>
      </div>
    );
  }
  if (done) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
        <h1 className="font-display text-5xl font-semibold text-night">{done.status === 'active' ? 'Your academy is live' : 'Thank you. Your academy is in review'}</h1>
        <p className="mt-4 text-lg text-ink-muted">{done.status === 'active' ? 'You can start adding courses and inviting members now.' : 'Our team reviews new academies, usually within a day. We will email you as soon as it is approved, and you can start preparing courses meanwhile.'}</p>
        <Link to={`/app/a/${done.slug}`} className="btn-primary mt-8">Open {done.name}</Link>
      </div>
    );
  }
  const submit = (e) => { e.preventDefault(); run(async () => { const t = await post('/me/academies', f); await reload(); setDone(t); }).catch(() => {}); };
  return (
    <div className="mx-auto grid max-w-5xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.3fr]">
      <div>
        <h1 className="font-display text-5xl font-semibold leading-tight text-night">Start your academy</h1>
        <p className="mt-4 text-lg text-ink-muted">Give your church, ministry or mentoring work a home for courses, live classes, podcasts, mentorship and prayer.</p>
        <p className="mt-4 text-ink-muted">It is free. After you apply, a GenWise administrator reviews and approves your academy.</p>
      </div>
      <form onSubmit={submit} className="panel space-y-4 p-6 sm:p-8">
        <Alert>{error}</Alert>
        <Input label="Academy name" name="name" required placeholder="e.g. Hope Chapel Discipleship Academy" value={f.name} onChange={set('name')} />
        <Select label="Type" name="type" value={f.type} onChange={set('type')} options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
        <Input label="Tagline" name="tagline" placeholder="One line about your academy" value={f.tagline} onChange={set('tagline')} />
        <Textarea label="About" name="about" rows={4} placeholder="Who you are, who you serve and what you teach" value={f.about} onChange={set('about')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="City" name="city" value={f.city} onChange={set('city')} />
          <Input label="Country" name="country" value={f.country} onChange={set('country')} />
          <Input label="Denomination (optional)" name="denomination" value={f.denomination} onChange={set('denomination')} />
          <Input label="Contact phone" name="contactPhone" type="tel" value={f.contactPhone} onChange={set('contactPhone')} />
        </div>
        <button type="submit" className="btn-primary w-full py-3" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Submit academy for review'}</button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ certificate verification */
export function VerifyCertificate() {
  const { serial: initial } = useParams();
  const [serial, setSerial] = useState(initial || '');
  const [res, setRes] = useState(null);
  const { busy, error, run } = useAction();
  useTitle('Verify a certificate');
  const check = (s) => run(async () => setRes(await get(`/public/verify/${encodeURIComponent(s.trim())}`))).catch(() => setRes(null));
  useEffect(() => { if (initial) check(initial); }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-5xl font-semibold text-night">Verify a certificate</h1>
      <p className="mt-2 text-ink-muted">Enter the serial number printed on a GenWise Africa certificate, or scan its QR code.</p>
      <form className="mt-8 flex gap-2" onSubmit={(e) => { e.preventDefault(); check(serial); }}>
        <input className="input font-mono uppercase" placeholder="GWA-2026-XXXXXXXX" value={serial} onChange={(e) => setSerial(e.target.value)} aria-label="Serial number" />
        <button type="submit" className="btn-primary" disabled={busy || !serial}>{busy ? <Spinner className="text-white" /> : 'Verify'}</button>
      </form>
      <div className="mt-8">
        {error && <div className="panel flex gap-4 p-6"><ShieldX className="h-8 w-8 text-red-600" /><div><p className="font-semibold text-night">Not found</p><p className="text-sm text-ink-muted">{error}</p></div></div>}
        {res && (
          <div className={`panel flex gap-4 p-6 ${res.valid ? 'border-emerald/30' : 'border-red-200'}`}>
            {res.valid ? <ShieldCheck className="h-9 w-9 shrink-0 text-emerald" /> : <ShieldX className="h-9 w-9 shrink-0 text-red-600" />}
            <div>
              <p className="font-semibold text-night">{res.valid ? 'Valid certificate' : 'This certificate has been revoked'}</p>
              <p className="mt-2 font-display text-3xl font-semibold text-night">{res.learner}</p>
              <p className="text-ink-muted">completed <b className="text-night">{res.course}</b></p>
              <p className="text-ink-muted">at <Link className="link" to={`/a/${res.academySlug}`}>{res.academy}</Link></p>
              <p className="mt-2 flex items-center gap-1 text-sm text-ink-muted"><Clock className="h-3.5 w-3.5" />Issued {fmtDate(res.issuedAt)} · {res.serial}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
