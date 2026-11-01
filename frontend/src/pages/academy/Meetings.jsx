import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Video, Plus, CalendarPlus, Users, ExternalLink, XCircle, Square } from 'lucide-react';
import { useApi, useAction, useTitle } from '../../lib/hooks';
import { post, patch, del, openFile } from '../../lib/api';
import { fmtDateTime, fmtTime, toLocalInput, MEETING_LABEL } from '../../lib/format';
import { Alert, Avatar, Badge, Empty, Input, Modal, PageLoader, SectionHeader, Select, Spinner, Tabs, Textarea } from '../../components/ui';
import { useAcademy, MembersOnly } from './AcademyContext';

const LiveRoom = lazy(() => import('./LiveRoom'));

export function MeetingForm({ open, onClose, initial, onSaved }) {
  const { slug } = useAcademy();
  const start = new Date(Date.now() + 24 * 3600e3); start.setMinutes(0, 0, 0);
  const [f, setF] = useState(initial ? { ...initial, startsAt: toLocalInput(initial.startsAt), endsAt: initial.endsAt ? toLocalInput(initial.endsAt) : '' } : { title: '', description: '', type: 'live_class', provider: 'livekit', joinUrl: '', startsAt: toLocalInput(start), endsAt: toLocalInput(new Date(start.getTime() + 3600e3)), visibility: 'members', capacity: 100 });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = (e) => {
    e.preventDefault();
    run(async () => {
      const body = { ...f, startsAt: new Date(f.startsAt).toISOString(), endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : undefined, capacity: parseInt(f.capacity, 10) || 100 };
      const r = initial?.id ? await patch(`/t/${slug}/meetings/${initial.id}`, body) : await post(`/t/${slug}/meetings`, body);
      onSaved(r); onClose();
    }).catch(() => {});
  };
  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? 'Edit meeting' : 'Schedule a meeting'} wide>
      <form onSubmit={save} className="space-y-4">
        <Alert>{error}</Alert>
        <Input label="Title" name="title" required value={f.title} onChange={set('title')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Kind of meeting" name="type" value={f.type} onChange={set('type')} options={Object.entries(MEETING_LABEL).filter(([v]) => v !== 'mentorship_session').map(([value, label]) => ({ value, label }))} />
          <Select label="Who can see it" name="visibility" value={f.visibility} onChange={set('visibility')} options={[{ value: 'members', label: 'Academy members' }, { value: 'public', label: 'Public (shown on academy page)' }]} />
          <Input label="Starts" name="startsAt" type="datetime-local" required value={f.startsAt} onChange={set('startsAt')} />
          <Input label="Ends" name="endsAt" type="datetime-local" value={f.endsAt} onChange={set('endsAt')} />
        </div>
        <Select label="Where" name="provider" value={f.provider} onChange={set('provider')} options={[{ value: 'livekit', label: 'GenWise video room (recommended)' }, { value: 'external', label: 'External link (Zoom, Google Meet…)' }]} />
        {f.provider === 'external' && <Input label="Join link" name="joinUrl" type="url" required placeholder="https://" value={f.joinUrl || ''} onChange={set('joinUrl')} />}
        <Textarea label="Description" name="description" rows={3} value={f.description || ''} onChange={set('description')} />
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Spinner className="text-white" /> : initial?.id ? 'Save changes' : 'Schedule meeting'}</button>
      </form>
    </Modal>
  );
}

export function MeetingList() {
  const { slug, caps } = useAcademy();
  useTitle('Live classes & meetings');
  const [range, setRange] = useState('upcoming');
  const { data, loading, reload } = useApi(`/t/${slug}/meetings?range=${range}`, [range]);
  const [creating, setCreating] = useState(false);
  const nav = useNavigate();
  const groups = {};
  (data || []).forEach((m) => { const k = new Date(m.startsAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Nairobi' }); (groups[k] ||= []).push(m); });
  return (
    <MembersOnly>
      <SectionHeader title="Live classes & meetings" action={caps.host && <button type="button" className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Schedule</button>}>Join from your phone or computer. The room opens 15 minutes before the start.</SectionHeader>
      <Tabs value={range} onChange={setRange} tabs={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} />
      {loading ? <PageLoader /> : Object.keys(groups).length ? (
        <div className="space-y-8">
          {Object.entries(groups).map(([day, items]) => (
            <section key={day}>
              <h2 className="mb-3 font-display text-2xl font-semibold text-night">{day}</h2>
              <ul className="panel divide-y divide-dawn-200">
                {items.map((m) => (
                  <li key={m.id}>
                    <Link to={m.id} className="flex items-center gap-4 p-4 hover:bg-dawn/50">
                      <div className="w-16 shrink-0 text-center"><p className="font-display text-2xl font-semibold text-night">{fmtTime(m.startsAt)}</p></div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-night">{m.title}</p>
                        <p className="text-xs text-ink-muted">{MEETING_LABEL[m.type]} · {m.host?.fullName}</p>
                      </div>
                      {m.status === 'live' && <Badge tone="emerald">Live now</Badge>}
                      {m.status === 'cancelled' && <Badge tone="red">Cancelled</Badge>}
                      {m.myRsvp === 'going' && <Badge tone="gold">Going</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : <Empty icon={Video} title={range === 'past' ? 'No past meetings' : 'Nothing scheduled'} action={caps.host && range === 'upcoming' && <button type="button" className="btn-primary" onClick={() => setCreating(true)}>Schedule a live class</button>}>{range === 'upcoming' ? 'When your academy schedules a live class, prayer meeting or webinar it appears here.' : ''}</Empty>}
      {creating && <MeetingForm open onClose={() => setCreating(false)} onSaved={(m) => { reload(); nav(m.id); }} />}
    </MembersOnly>
  );
}

export function MeetingDetail() {
  const { slug } = useAcademy();
  const { meetingId } = useParams();
  const nav = useNavigate();
  const { data, loading, error, reload } = useApi(`/t/${slug}/meetings/${meetingId}`);
  const [join, setJoin] = useState(null);
  const [editing, setEditing] = useState(false);
  const { busy, error: actErr, run } = useAction();
  useTitle(data?.meeting?.title);
  if (loading && !data) return <PageLoader />;
  if (error) return <Empty title="Meeting unavailable">{error.message}</Empty>;
  const { meeting: m, attendees, myRsvp, canEdit } = data;
  const doJoin = () => run(async () => {
    const info = await post(`/t/${slug}/meetings/${m.id}/join`);
    if (info.provider === 'livekit') setJoin(info); else window.open(info.url, '_blank', 'noopener');
  }).catch(() => {});

  if (join) {
    return (
      <Suspense fallback={<PageLoader />}>
        <LiveRoom info={join} onLeave={() => { setJoin(null); reload(); }} onEnd={canEdit ? async () => { await post(`/t/${slug}/meetings/${m.id}/end`); setJoin(null); reload(); } : null} />
      </Suspense>
    );
  }
  const live = m.status === 'live' || (new Date(m.startsAt).getTime() - Date.now() < 15 * 60e3 && (!m.endsAt || new Date(m.endsAt) > new Date()));
  return (
    <div className="mx-auto max-w-3xl">
      <Link to={`/app/a/${slug}/meetings`} className="text-sm text-ink-muted hover:text-night">Meetings</Link>
      <div className="mt-3 overflow-hidden rounded-3xl bg-night p-8 text-dawn">
        <Badge tone="gold">{MEETING_LABEL[m.type]}</Badge>
        <h1 className="mt-3 font-display text-5xl font-semibold text-gold-light">{m.title}</h1>
        <p className="mt-3 text-lg text-dawn/85">{fmtDateTime(m.startsAt)}{m.endsAt ? ` to ${fmtTime(m.endsAt)}` : ''} EAT</p>
        <div className="mt-4 flex items-center gap-3 text-sm text-dawn/70"><Avatar name={m.host?.fullName} src={m.host?.avatarUrl} size={28} />Hosted by {m.host?.fullName}<span className="inline-flex items-center gap-1"><Users className="h-4 w-4" />{attendees} going</span></div>
        <div className="mt-7 flex flex-wrap gap-2">
          {m.status === 'cancelled' ? <Badge tone="red">This meeting was cancelled</Badge> : m.status === 'ended' ? (m.recordingUrl ? <a href={m.recordingUrl} target="_blank" rel="noreferrer" className="btn-gold">Watch recording</a> : <span className="text-dawn/70">This meeting has ended.</span>) : (
            <>
              <button type="button" className="btn-gold" onClick={doJoin} disabled={busy}>{busy ? <Spinner /> : <><Video className="h-4 w-4" />{live || canEdit ? 'Join now' : 'Join (opens 15 min before)'}</>}{m.provider === 'external' && <ExternalLink className="h-3.5 w-3.5" />}</button>
              {myRsvp !== 'going' && myRsvp !== 'host' && <button type="button" className="btn-ghost-light" onClick={() => run(async () => { await post(`/t/${slug}/meetings/${m.id}/rsvp`, { rsvp: 'going' }); reload(); })}>I’ll be there</button>}
              <button type="button" className="btn-ghost-light" onClick={() => openFile(`/t/${slug}/meetings/${m.id}/ics`, 'genwise-meeting.ics')}><CalendarPlus className="h-4 w-4" />Add to calendar</button>
            </>
          )}
        </div>
      </div>
      <div className="mt-4"><Alert>{actErr}</Alert></div>
      {m.description && <p className="mt-6 whitespace-pre-line text-lg text-ink">{m.description}</p>}
      {canEdit && m.status !== 'cancelled' && (
        <div className="mt-8 flex flex-wrap gap-2 border-t border-dawn-200 pt-6">
          <button type="button" className="btn-outline" onClick={() => setEditing(true)}>Edit</button>
          {m.status === 'live' && <button type="button" className="btn-outline" onClick={() => run(async () => { const url = window.prompt('Recording link (optional)') || undefined; await post(`/t/${slug}/meetings/${m.id}/end`, { recordingUrl: url }); reload(); })}><Square className="h-4 w-4" />Mark as ended</button>}
          <button type="button" className="btn-danger" onClick={() => { if (window.confirm('Cancel this meeting? Attendees will be notified.')) run(async () => { await del(`/t/${slug}/meetings/${m.id}`); nav(`/app/a/${slug}/meetings`); }); }}><XCircle className="h-4 w-4" />Cancel meeting</button>
        </div>
      )}
      {editing && <MeetingForm open initial={m} onClose={() => setEditing(false)} onSaved={reload} />}
    </div>
  );
}
