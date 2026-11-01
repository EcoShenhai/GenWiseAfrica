import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { HeartHandshake, Flame, Plus, Video, Lock, Users, HandHeart, Sparkles, Trash2 } from 'lucide-react';
import { useApi, useAction, useTitle } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import { post, put, patch, del } from '../../lib/api';
import { ago, fmtDateTime, toLocalInput } from '../../lib/format';
import { Alert, Avatar, Badge, Empty, Input, Modal, PageLoader, SectionHeader, Select, Spinner, Tabs, Textarea, useToast } from '../../components/ui';
import { useAcademy, MembersOnly } from './AcademyContext';

/* ================================================================== MENTORSHIP */
const STATUS_TONE = { requested: 'gold', active: 'emerald', declined: 'red', completed: 'muted' };

function MentorProfileForm({ open, onClose, existing, onSaved }) {
  const { slug } = useAcademy();
  const [f, setF] = useState(existing ? { ...existing, expertise: (existing.expertise || []).join(', ') } : { headline: '', bio: '', expertise: '', languages: 'English', capacity: 5, accepting: true, availability: '' });
  const { busy, error, run } = useAction();
  return (
    <Modal open={open} onClose={onClose} title="My mentor profile">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(async () => { await put(`/t/${slug}/mentors/me`, { ...f, capacity: parseInt(f.capacity, 10) || 5 }); onSaved(); onClose(); }).catch(() => {}); }}>
        <Alert>{error}</Alert>
        <Input label="Headline" name="headline" placeholder="e.g. Marriage & family mentor" value={f.headline || ''} onChange={(e) => setF({ ...f, headline: e.target.value })} />
        <Textarea label="About you" name="bio" value={f.bio || ''} onChange={(e) => setF({ ...f, bio: e.target.value })} />
        <Input label="Areas you mentor in" name="expertise" hint="Separate with commas" value={f.expertise} onChange={(e) => setF({ ...f, expertise: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Languages" name="languages" value={f.languages || ''} onChange={(e) => setF({ ...f, languages: e.target.value })} />
          <Input label="Mentees at a time" name="capacity" type="number" min="1" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} />
        </div>
        <Input label="When you are usually available" name="availability" placeholder="e.g. Weekday evenings, Saturday mornings" value={f.availability || ''} onChange={(e) => setF({ ...f, availability: e.target.value })} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-emerald" checked={!!f.accepting} onChange={(e) => setF({ ...f, accepting: e.target.checked })} />Accepting new mentees</label>
        <button type="submit" className="btn-primary" disabled={busy}>Save profile</button>
      </form>
    </Modal>
  );
}

export function Mentorship() {
  const { slug, caps } = useAcademy();
  const { user } = useAuth();
  useTitle('Mentorship');
  const [tab, setTab] = useState('mine');
  const mentors = useApi(`/t/${slug}/mentors`);
  const mine = useApi(`/t/${slug}/mentorships`);
  const [asking, setAsking] = useState(null);
  const [msg, setMsg] = useState('');
  const [editProfile, setEditProfile] = useState(false);
  const { busy, error, run } = useAction();
  const { toast, toastEl } = useToast();
  const myProfile = (mentors.data || []).find((m) => m.userId === user.id);
  const request = (e) => { e.preventDefault(); run(async () => { await post(`/t/${slug}/mentorships`, { mentorId: asking.userId, message: msg }); setAsking(null); setMsg(''); mine.reload(); setTab('mine'); toast('Request sent to your mentor'); }).catch(() => {}); };
  return (
    <MembersOnly>
      <SectionHeader title="Mentorship" action={caps.mentor && <button type="button" className="btn-outline" onClick={() => setEditProfile(true)}>{myProfile ? 'Edit my mentor profile' : 'Become a mentor'}</button>}>Walk with someone who has walked the road before you.</SectionHeader>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'mine', label: 'My mentorships', count: (mine.data || []).filter((x) => x.status === 'requested' && x.mentorId === user.id).length }, { value: 'find', label: 'Find a mentor' }]} />
      {tab === 'mine' && (mine.loading ? <PageLoader /> : mine.data?.length ? (
        <ul className="panel divide-y divide-dawn-200">
          {mine.data.map((x) => {
            const other = x.mentorId === user.id ? x.mentee : x.mentor;
            return (
              <li key={x.id}>
                <Link to={x.id} className="flex items-center gap-4 p-4 hover:bg-dawn/50">
                  <Avatar name={other?.fullName} src={other?.avatarUrl} size={42} />
                  <div className="min-w-0 flex-1"><p className="font-semibold text-night">{other?.fullName}</p><p className="text-xs text-ink-muted">{x.mentorId === user.id ? 'Your mentee' : 'Your mentor'} · updated {ago(x.updatedAt)}</p></div>
                  <Badge tone={STATUS_TONE[x.status]}>{x.status === 'requested' && x.mentorId === user.id ? 'Needs your reply' : x.status}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : <Empty icon={HeartHandshake} title="No mentorships yet" action={<button type="button" className="btn-primary" onClick={() => setTab('find')}>Find a mentor</button>}>Request a mentor and agree goals together.</Empty>)}
      {tab === 'find' && (mentors.loading ? <PageLoader /> : mentors.data?.length ? (
        <ul className="grid gap-5 md:grid-cols-2">
          {mentors.data.map((m) => (
            <li key={m.id} className="panel flex flex-col p-6">
              <div className="flex items-center gap-4"><Avatar name={m.User?.fullName} src={m.User?.avatarUrl} size={52} /><div><p className="font-display text-2xl font-semibold text-night">{m.User?.fullName}</p><p className="text-sm text-ink-muted">{m.headline}</p></div></div>
              {m.bio && <p className="mt-4 text-sm text-ink">{m.bio}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">{(m.expertise || []).map((e) => <Badge key={e}>{e}</Badge>)}</div>
              <p className="mt-3 text-xs text-ink-muted">{m.languages}{m.availability ? ` · ${m.availability}` : ''} · {m.activeMentees}/{m.capacity} mentees</p>
              <div className="mt-auto pt-5">{m.userId === user.id ? <Badge tone="gold">This is you</Badge> : m.accepting ? <button type="button" className="btn-primary btn-sm" onClick={() => setAsking(m)}>Ask to be mentored</button> : <span className="text-sm text-ink-muted">Not accepting new mentees</span>}</div>
            </li>
          ))}
        </ul>
      ) : <Empty icon={HeartHandshake} title="No mentors listed yet">Academy admins can give members the mentor role, and mentors can then set up their profile here.</Empty>)}
      <Modal open={!!asking} onClose={() => setAsking(null)} title={`Ask ${asking?.User?.fullName || ''} to mentor you`}>
        <form onSubmit={request} className="space-y-4">
          <Alert>{error}</Alert>
          <Textarea label="Introduce yourself and what you hope to grow in" name="msg" rows={5} required value={msg} onChange={(e) => setMsg(e.target.value)} />
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Send request'}</button>
        </form>
      </Modal>
      {editProfile && <MentorProfileForm open existing={myProfile} onClose={() => setEditProfile(false)} onSaved={mentors.reload} />}
      {toastEl}
    </MembersOnly>
  );
}

export function MentorshipDetail() {
  const { slug } = useAcademy();
  const { mentorshipId } = useParams();
  const { data, loading, error, reload } = useApi(`/t/${slug}/mentorships/${mentorshipId}`);
  const [note, setNote] = useState({ body: '', visibility: 'shared' });
  const [goals, setGoals] = useState(null);
  const [booking, setBooking] = useState(false);
  const [slot, setSlot] = useState({ startsAt: toLocalInput(new Date(Date.now() + 2 * 86400e3)), durationMin: 45 });
  const { busy, error: actErr, run } = useAction();
  if (loading && !data) return <PageLoader />;
  if (error) return <Empty title="Mentorship unavailable">{error.message}</Empty>;
  const { mentorship: ms, notes, sessions, isMentor } = data;
  const other = isMentor ? ms.mentee : ms.mentor;
  const setStatus = (status) => run(async () => { await patch(`/t/${slug}/mentorships/${ms.id}`, { status }); reload(); });
  return (
    <div className="mx-auto max-w-4xl">
      <Link to={`/app/a/${slug}/mentorship`} className="text-sm text-ink-muted hover:text-night">Mentorship</Link>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Avatar name={other.fullName} src={other.avatarUrl} size={60} />
        <div className="flex-1"><p className="text-sm text-ink-muted">{isMentor ? 'Mentoring' : 'Mentored by'}</p><h1 className="font-display text-4xl font-semibold text-night">{other.fullName}</h1></div>
        <Badge tone={STATUS_TONE[ms.status]}>{ms.status}</Badge>
      </div>
      <Alert>{actErr}</Alert>
      {ms.message && <blockquote className="mt-6 border-l-2 border-gold pl-4 text-ink"><p className="text-xs text-ink-muted">Request message</p>{ms.message}</blockquote>}
      {ms.status === 'requested' && isMentor && (
        <div className="mt-6 flex gap-2"><button type="button" className="btn-primary" onClick={() => setStatus('active')}>Accept mentee</button><button type="button" className="btn-outline" onClick={() => setStatus('declined')}>Decline</button></div>
      )}
      {ms.status === 'requested' && !isMentor && <p className="mt-6 text-ink-muted">Waiting for {other.fullName} to reply.</p>}
      {ms.status === 'active' && (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1.3fr_1fr]">
          <section>
            <h2 className="font-display text-2xl font-semibold text-night">Notes and journal</h2>
            <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await post(`/t/${slug}/mentorships/${ms.id}/notes`, note); setNote({ ...note, body: '' }); reload(); }); }}>
              <textarea className="input" rows={3} placeholder="Reflections, prayer points or what you discussed" value={note.body} onChange={(e) => setNote({ ...note, body: e.target.value })} aria-label="New note" />
              <div className="flex items-center justify-between gap-2">
                <select className="input w-auto py-1.5 text-sm" value={note.visibility} onChange={(e) => setNote({ ...note, visibility: e.target.value })} aria-label="Note visibility"><option value="shared">Shared with {other.fullName.split(' ')[0]}</option><option value="private">Private to me</option></select>
                <button type="submit" className="btn-primary btn-sm" disabled={busy || !note.body.trim()}>Add note</button>
              </div>
            </form>
            <ul className="mt-5 space-y-3">
              {notes.map((n) => <li key={n.id} className="panel p-4"><p className="whitespace-pre-line text-sm text-ink">{n.body}</p><p className="mt-2 flex items-center gap-1 text-xs text-ink-muted">{n.visibility === 'private' && <Lock className="h-3 w-3" />}{n.author?.fullName} · {ago(n.createdAt)}</p></li>)}
              {!notes.length && <li className="text-sm text-ink-muted">No notes yet.</li>}
            </ul>
          </section>
          <aside className="space-y-6">
            <div className="panel p-5">
              <h2 className="font-display text-2xl font-semibold text-night">Goals</h2>
              {goals === null ? <><p className="mt-2 whitespace-pre-line text-sm text-ink">{ms.goals || 'No goals written yet.'}</p><button type="button" className="btn-ghost btn-sm mt-2 text-emerald" onClick={() => setGoals(ms.goals || '')}>Edit goals</button></>
                : <div className="mt-2 space-y-2"><textarea className="input" rows={4} value={goals} onChange={(e) => setGoals(e.target.value)} aria-label="Goals" /><button type="button" className="btn-primary btn-sm" onClick={() => run(async () => { await patch(`/t/${slug}/mentorships/${ms.id}`, { goals }); setGoals(null); reload(); })}>Save goals</button></div>}
            </div>
            <div className="panel p-5">
              <div className="flex items-center justify-between"><h2 className="font-display text-2xl font-semibold text-night">Sessions</h2><button type="button" className="btn-primary btn-sm" onClick={() => setBooking(true)}><Plus className="h-3.5 w-3.5" />Book</button></div>
              <ul className="mt-3 space-y-2">{sessions.map((s) => <li key={s.id}><Link to={`/app/a/${slug}/meetings/${s.id}`} className="flex items-center gap-2 text-sm hover:text-emerald"><Video className="h-4 w-4 text-emerald" />{fmtDateTime(s.startsAt)}{s.status !== 'scheduled' && <Badge>{s.status}</Badge>}</Link></li>)}{!sessions.length && <li className="text-sm text-ink-muted">No sessions booked yet.</li>}</ul>
            </div>
            <button type="button" className="btn-outline w-full" onClick={() => { if (window.confirm('Mark this mentorship as completed?')) setStatus('completed'); }}>Complete mentorship</button>
          </aside>
        </div>
      )}
      <Modal open={booking} onClose={() => setBooking(false)} title="Book a session">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(async () => { await post(`/t/${slug}/mentorships/${ms.id}/sessions`, { startsAt: new Date(slot.startsAt).toISOString(), durationMin: slot.durationMin }); setBooking(false); reload(); }).catch(() => {}); }}>
          <Input label="Date and time" name="slot" type="datetime-local" required value={slot.startsAt} onChange={(e) => setSlot({ ...slot, startsAt: e.target.value })} />
          <Select label="Length" name="dur" value={slot.durationMin} onChange={(e) => setSlot({ ...slot, durationMin: e.target.value })} options={[{ value: 30, label: '30 minutes' }, { value: 45, label: '45 minutes' }, { value: 60, label: '1 hour' }]} />
          <p className="text-sm text-ink-muted">A private video room is created for the two of you, and you both get an email reminder.</p>
          <button type="submit" className="btn-primary" disabled={busy}>Book session</button>
        </form>
      </Modal>
    </div>
  );
}

/* ================================================================== PRAYER */
export function Prayer() {
  const { slug, caps } = useAcademy();
  useTitle('Prayer');
  const [tab, setTab] = useState('wall');
  const [groupFilter, setGroupFilter] = useState('');
  const groups = useApi(`/t/${slug}/prayer/groups`);
  const reqs = useApi(`/t/${slug}/prayer/requests${groupFilter ? `?groupId=${groupFilter}` : ''}`, [groupFilter]);
  const [f, setF] = useState({ title: '', body: '', groupId: '', isAnonymous: false, visibility: 'academy' });
  const [newGroup, setNewGroup] = useState(null);
  const [praise, setPraise] = useState(null);
  const { busy, error, run } = useAction();
  const { toast, toastEl } = useToast();
  const submit = (e) => { e.preventDefault(); run(async () => { await post(`/t/${slug}/prayer/requests`, { ...f, groupId: f.groupId || null }); setF({ title: '', body: '', groupId: '', isAnonymous: false, visibility: 'academy' }); reqs.reload(); toast('Your request has been shared'); }).catch(() => {}); };
  const pray = (r) => run(async () => { const d = await post(`/t/${slug}/prayer/requests/${r.id}/pray`); reqs.setData((list) => list.map((x) => (x.id === r.id ? { ...x, prayedCount: d.prayedCount, iPrayed: true } : x))); }).catch(() => {});
  return (
    <MembersOnly>
      <SectionHeader title="Prayer">“Carry each other’s burdens.” Galatians 6:2</SectionHeader>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'wall', label: 'Prayer wall' }, { value: 'groups', label: 'Prayer groups', count: groups.data?.length }]} />
      {tab === 'wall' && (
        <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
          <form onSubmit={submit} className="panel h-fit space-y-4 p-6 lg:sticky lg:top-20">
            <h2 className="font-display text-2xl font-semibold text-night">Share a request</h2>
            <Alert>{error}</Alert>
            <Input label="What can we pray for?" name="ptitle" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <Textarea label="More detail (optional)" name="pbody" rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
            <Select label="Share with" name="vis" value={f.groupId ? `g:${f.groupId}` : f.visibility} onChange={(e) => { const v = e.target.value; if (v.startsWith('g:')) setF({ ...f, groupId: v.slice(2), visibility: 'group' }); else setF({ ...f, groupId: '', visibility: v }); }}
              options={[{ value: 'academy', label: 'The whole academy' }, { value: 'leaders', label: 'Prayer leaders only' }, ...(groups.data || []).filter((g) => g.joined).map((g) => ({ value: `g:${g.id}`, label: `Group: ${g.name}` }))]} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-emerald" checked={f.isAnonymous} onChange={(e) => setF({ ...f, isAnonymous: e.target.checked })} />Post anonymously</label>
            <button type="submit" className="btn-primary w-full" disabled={busy}>Share request</button>
          </form>
          <div>
            <div className="mb-4 flex items-center gap-2"><select className="input w-auto py-1.5 text-sm" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} aria-label="Filter by group"><option value="">All requests</option>{(groups.data || []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
            {reqs.loading ? <PageLoader /> : reqs.data?.length ? (
              <ul className="space-y-4">
                {reqs.data.map((r) => (
                  <li key={r.id} className={`panel p-5 ${r.status === 'answered' ? 'border-gold/50' : ''}`}>
                    <div className="flex items-start gap-3">
                      <Avatar name={r.User?.fullName} src={r.isAnonymous ? null : r.User?.avatarUrl} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-ink-muted">{r.User?.fullName} · {ago(r.createdAt)}{r.group ? ` · ${r.group.name}` : ''}{r.visibility === 'leaders' ? ' · leaders only' : ''}</p>
                        <h3 className="font-display text-2xl font-semibold text-night">{r.title}</h3>
                        {r.body && <p className="mt-1 whitespace-pre-line text-sm text-ink">{r.body}</p>}
                        {r.status === 'answered' && <div className="mt-3 rounded-xl bg-gold-pale/60 p-3 text-sm"><p className="flex items-center gap-1.5 font-semibold text-night"><Sparkles className="h-4 w-4 text-gold-deep" />Answered prayer</p>{r.praiseReport && <p className="mt-1 text-ink">{r.praiseReport}</p>}</div>}
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <button type="button" onClick={() => pray(r)} disabled={r.iPrayed} className={`btn-sm btn ${r.iPrayed ? 'bg-emerald-50 text-emerald' : 'border border-dawn-300 bg-white text-night hover:border-emerald'}`}><HandHeart className="h-4 w-4" />{r.iPrayed ? 'You prayed' : 'I prayed'}{r.prayedCount ? ` · ${r.prayedCount}` : ''}</button>
                          {r.mine && r.status === 'open' && <button type="button" className="btn-ghost btn-sm text-gold-deep" onClick={() => setPraise({ r, text: '' })}>Mark as answered</button>}
                          {(r.mine || caps.lead_prayer) && <button type="button" className="btn-ghost btn-sm text-ink-soft" aria-label="Delete request" onClick={async () => { if (window.confirm('Remove this prayer request?')) { await del(`/t/${slug}/prayer/requests/${r.id}`); reqs.reload(); } }}><Trash2 className="h-3.5 w-3.5" /></button>}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <Empty icon={Flame} title="No prayer requests yet">Be the first to share what is on your heart.</Empty>}
          </div>
        </div>
      )}
      {tab === 'groups' && (
        <div>
          {caps.lead_prayer && <button type="button" className="btn-primary mb-5" onClick={() => setNewGroup({ name: '', description: '', schedule: '', visibility: 'open' })}><Plus className="h-4 w-4" />New prayer group</button>}
          {groups.data?.length ? (
            <ul className="grid gap-5 md:grid-cols-2">
              {groups.data.map((g) => (
                <li key={g.id} className="panel flex flex-col p-6">
                  <h2 className="font-display text-2xl font-semibold text-night">{g.name}</h2>
                  {g.schedule && <p className="text-sm text-emerald">{g.schedule}</p>}
                  {g.description && <p className="mt-2 text-sm text-ink">{g.description}</p>}
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted"><Users className="h-3.5 w-3.5" />{g.memberCount} members · led by {g.leader?.fullName}</p>
                  <div className="mt-auto flex gap-2 pt-5">
                    {g.joined ? <><button type="button" className="btn-outline btn-sm" onClick={() => { setGroupFilter(g.id); setTab('wall'); }}>Open requests</button><button type="button" className="btn-ghost btn-sm" onClick={async () => { await post(`/t/${slug}/prayer/groups/${g.id}/leave`); groups.reload(); }}>Leave</button></>
                      : <button type="button" className="btn-primary btn-sm" onClick={() => run(async () => { await post(`/t/${slug}/prayer/groups/${g.id}/join`); groups.reload(); toast(`You joined ${g.name}`); }).catch(() => {})}>{g.visibility === 'closed' ? 'Closed group' : 'Join group'}</button>}
                  </div>
                </li>
              ))}
            </ul>
          ) : <Empty icon={Users} title="No prayer groups yet">Prayer leaders and admins can start groups for intercession, families, youth and more.</Empty>}
        </div>
      )}
      <Modal open={!!newGroup} onClose={() => setNewGroup(null)} title="New prayer group">
        {newGroup && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(async () => { await post(`/t/${slug}/prayer/groups`, newGroup); setNewGroup(null); groups.reload(); }).catch(() => {}); }}>
            <Input label="Name" name="gname" required value={newGroup.name} onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })} />
            <Textarea label="Description" name="gdesc" value={newGroup.description} onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })} />
            <Input label="When you meet" name="gsched" placeholder="e.g. Fridays 7 PM" value={newGroup.schedule} onChange={(e) => setNewGroup({ ...newGroup, schedule: e.target.value })} />
            <Select label="Joining" name="gvis" value={newGroup.visibility} onChange={(e) => setNewGroup({ ...newGroup, visibility: e.target.value })} options={[{ value: 'open', label: 'Any member can join' }, { value: 'closed', label: 'Leaders add members' }]} />
            <button type="submit" className="btn-primary" disabled={busy}>Create group</button>
          </form>
        )}
      </Modal>
      <Modal open={!!praise} onClose={() => setPraise(null)} title="Share how God answered">
        {praise && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(async () => { await patch(`/t/${slug}/prayer/requests/${praise.r.id}`, { status: 'answered', praiseReport: praise.text }); setPraise(null); reqs.reload(); }); }}>
            <Textarea label="Praise report (optional)" name="praise" rows={4} value={praise.text} onChange={(e) => setPraise({ ...praise, text: e.target.value })} />
            <button type="submit" className="btn-gold">Mark as answered</button>
          </form>
        )}
      </Modal>
      {toastEl}
    </MembersOnly>
  );
}
