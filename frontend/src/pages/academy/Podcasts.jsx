import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Mic2, Plus, Rss, Trash2, Play } from 'lucide-react';
import { useApi, useAction, useTitle } from '../../lib/hooks';
import { post, patch, del } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { Alert, Badge, Empty, Input, Modal, PageLoader, SectionHeader, Select, Spinner, Textarea, useToast } from '../../components/ui';
import { useAcademy } from './AcademyContext';
import { UploadButton } from './Studio';

function ShowForm({ open, onClose, initial, onSaved }) {
  const { slug } = useAcademy();
  const [f, setF] = useState(initial || { title: '', description: '', category: 'Christianity', visibility: 'public', coverUrl: '' });
  const { busy, error, run } = useAction();
  const save = (e) => { e.preventDefault(); run(async () => { const r = initial?.id ? await patch(`/t/${slug}/podcasts/${initial.id}`, f) : await post(`/t/${slug}/podcasts`, f); onSaved(r); onClose(); }).catch(() => {}); };
  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? 'Edit show' : 'New podcast show'}>
      <form onSubmit={save} className="space-y-4">
        <Alert>{error}</Alert>
        <Input label="Show title" name="title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Textarea label="Description" name="description" value={f.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <Select label="Who can listen" name="visibility" value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value })} options={[{ value: 'public', label: 'Everyone (public, RSS feed)' }, { value: 'members', label: 'Academy members' }, { value: 'draft', label: 'Draft (hidden)' }]} />
        <div className="flex items-center gap-3">{f.coverUrl && <img src={f.coverUrl} alt="" className="h-14 w-14 rounded-lg object-cover" />}<UploadButton kind="image" label="Cover art" onUploaded={(url) => setF({ ...f, coverUrl: url })} /></div>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Save show'}</button>
      </form>
    </Modal>
  );
}

export function PodcastList() {
  const { slug, caps } = useAcademy();
  useTitle('Podcasts');
  const { data, loading, reload } = useApi(`/t/${slug}/podcasts`);
  const [creating, setCreating] = useState(false);
  return (
    <div>
      <SectionHeader title="Podcasts" action={caps.host && <button type="button" className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New show</button>}>Teachings and conversations to listen to anywhere.</SectionHeader>
      {loading ? <PageLoader /> : data?.length ? (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((s) => (
            <li key={s.id}>
              <Link to={s.id} className="panel flex h-full gap-4 p-5 hover:border-gold/60">
                {s.coverUrl ? <img src={s.coverUrl} alt="" className="h-20 w-20 rounded-xl object-cover" /> : <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-night"><Mic2 className="h-8 w-8 text-gold" /></span>}
                <div className="min-w-0"><h2 className="font-display text-2xl font-semibold leading-tight text-night">{s.title}</h2><p className="mt-1 text-xs text-ink-muted">{s.episodeCount} episodes · {s.host?.fullName}</p>{s.visibility !== 'public' && <Badge tone="gold">{s.visibility}</Badge>}</div>
              </Link>
            </li>
          ))}
        </ul>
      ) : <Empty icon={Mic2} title="No podcasts yet" action={caps.host && <button type="button" className="btn-primary" onClick={() => setCreating(true)}>Start a show</button>}>Sermons, teachings and conversations will appear here.</Empty>}
      {creating && <ShowForm open onClose={() => setCreating(false)} onSaved={reload} />}
    </div>
  );
}

export function PodcastShow() {
  const { slug } = useAcademy();
  const { showId } = useParams();
  const { data, loading, error, reload } = useApi(`/t/${slug}/podcasts/${showId}`);
  const [editing, setEditing] = useState(false);
  const [ep, setEp] = useState({ title: '', audioUrl: '', durationMin: '', notes: '', scriptureRefs: '' });
  const [playing, setPlaying] = useState(null);
  const { busy, error: epErr, run } = useAction();
  const { toast, toastEl } = useToast();
  useTitle(data?.show?.title);
  if (loading && !data) return <PageLoader />;
  if (error) return <Empty title="Podcast unavailable">{error.message}</Empty>;
  const { show, episodes, canEdit, rssUrl } = data;
  const addEp = (e) => { e.preventDefault(); run(async () => { await post(`/t/${slug}/podcasts/${show.id}/episodes`, { ...ep, durationMin: parseInt(ep.durationMin, 10) || 0 }); setEp({ title: '', audioUrl: '', durationMin: '', notes: '', scriptureRefs: '' }); reload(); toast('Episode published'); }).catch(() => {}); };
  const play = (e) => { setPlaying(e.id); post(`/t/${slug}/episodes/${e.id}/play`).catch(() => {}); };
  return (
    <div className="mx-auto max-w-4xl">
      <Link to={`/app/a/${slug}/podcasts`} className="text-sm text-ink-muted hover:text-night">Podcasts</Link>
      <div className="mt-3 flex flex-col gap-6 sm:flex-row">
        {show.coverUrl ? <img src={show.coverUrl} alt="" className="h-40 w-40 rounded-2xl object-cover" /> : <span className="flex h-40 w-40 shrink-0 items-center justify-center rounded-2xl bg-night"><Mic2 className="h-14 w-14 text-gold" /></span>}
        <div>
          <h1 className="font-display text-5xl font-semibold text-night">{show.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">Hosted by {show.host?.fullName}</p>
          {show.description && <p className="mt-3 text-ink">{show.description}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {show.visibility === 'public' && <button type="button" className="btn-outline btn-sm" onClick={() => { navigator.clipboard?.writeText(rssUrl); toast('RSS feed link copied'); }}><Rss className="h-3.5 w-3.5" />Copy RSS feed</button>}
            {canEdit && <button type="button" className="btn-outline btn-sm" onClick={() => setEditing(true)}>Edit show</button>}
          </div>
        </div>
      </div>
      <ol className="mt-10 divide-y divide-dawn-200 border-y border-dawn-200">
        {episodes.map((e) => (
          <li key={e.id} className="py-5">
            <div className="flex items-start gap-4">
              <button type="button" onClick={() => play(e)} disabled={!e.audioUrl} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald text-white hover:bg-emerald-600 disabled:bg-dawn-300" aria-label={`Play ${e.title}`}><Play className="h-4 w-4" /></button>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-2xl font-semibold text-night">{e.title}</h2>
                <p className="text-xs text-ink-muted">{fmtDate(e.publishedAt)}{e.durationMin ? ` · ${e.durationMin} min` : ''}{e.scriptureRefs ? ` · ${e.scriptureRefs}` : ''}{canEdit ? ` · ${e.plays} plays` : ''}</p>
                {e.notes && <p className="mt-2 whitespace-pre-line text-sm text-ink">{e.notes}</p>}
                {playing === e.id && e.audioUrl && <audio src={e.audioUrl} controls autoPlay className="mt-3 w-full" />}
              </div>
              {canEdit && <button type="button" className="text-ink-soft hover:text-red-600" aria-label="Delete episode" onClick={async () => { if (window.confirm('Delete this episode?')) { await del(`/t/${slug}/episodes/${e.id}`); reload(); } }}><Trash2 className="h-4 w-4" /></button>}
            </div>
          </li>
        ))}
        {!episodes.length && <li className="py-8 text-center text-ink-muted">No episodes yet.</li>}
      </ol>
      {canEdit && (
        <form onSubmit={addEp} className="panel mt-8 space-y-4 p-6">
          <h2 className="font-display text-2xl font-semibold text-night">Publish an episode</h2>
          <Alert>{epErr}</Alert>
          <Input label="Episode title" name="eptitle" required value={ep.title} onChange={(e) => setEp({ ...ep, title: e.target.value })} />
          <div><label className="label" htmlFor="audioUrl">Audio file or link</label><div className="flex flex-wrap gap-2"><input id="audioUrl" className="input flex-1" placeholder="https://" value={ep.audioUrl} onChange={(e) => setEp({ ...ep, audioUrl: e.target.value })} /><UploadButton kind="audio" label="Upload audio" onUploaded={(url) => setEp((x) => ({ ...x, audioUrl: url }))} /></div></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Length (minutes)" name="durationMin" type="number" value={ep.durationMin} onChange={(e) => setEp({ ...ep, durationMin: e.target.value })} />
            <Input label="Scripture references" name="scriptureRefs" value={ep.scriptureRefs} onChange={(e) => setEp({ ...ep, scriptureRefs: e.target.value })} />
          </div>
          <Textarea label="Show notes" name="notes" value={ep.notes} onChange={(e) => setEp({ ...ep, notes: e.target.value })} />
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Publish episode'}</button>
        </form>
      )}
      {editing && <ShowForm open initial={show} onClose={() => setEditing(false)} onSaved={reload} />}
      {toastEl}
    </div>
  );
}
