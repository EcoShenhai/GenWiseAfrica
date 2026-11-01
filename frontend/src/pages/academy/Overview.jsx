import { Link } from 'react-router-dom';
import { BookOpen, Video, Mic2, HeartHandshake, Flame, Megaphone, ExternalLink } from 'lucide-react';
import { useApi, useTitle } from '../../lib/hooks';
import { fmtDateTime, ago, ROLE_LABEL, MEETING_LABEL } from '../../lib/format';
import { Badge } from '../../components/ui';
import { useAcademy, MembersOnly } from './AcademyContext';

export default function Overview() {
  const { academy: a, slug, membership, caps } = useAcademy();
  useTitle(a.name);
  const courses = useApi(caps.member ? `/t/${slug}/courses` : null);
  const meetings = useApi(caps.member ? `/t/${slug}/meetings` : null);
  const ann = useApi(caps.member ? `/t/${slug}/announcements` : null);
  const tiles = [
    { to: 'courses', icon: BookOpen, label: 'Courses', text: 'Learn at your own pace' },
    { to: 'meetings', icon: Video, label: 'Live classes', text: 'Gather and learn together' },
    { to: 'podcasts', icon: Mic2, label: 'Podcasts', text: 'Listen on the go' },
    { to: 'mentorship', icon: HeartHandshake, label: 'Mentorship', text: 'Walk with a mentor' },
    { to: 'prayer', icon: Flame, label: 'Prayer', text: 'Carry one another' },
  ];
  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl bg-night p-8 text-dawn sm:p-10">
        <div aria-hidden className="absolute -right-16 -top-16 h-64 w-64 rounded-full border border-gold/25" />
        <div aria-hidden className="absolute -right-4 -top-4 h-40 w-40 rounded-full border border-gold/20" />
        <div className="relative">
          {membership && <Badge tone="gold">{ROLE_LABEL[membership.role]}</Badge>}
          <h1 className="mt-3 font-display text-5xl font-semibold text-gold-light">{a.name}</h1>
          {a.tagline && <p className="mt-2 max-w-2xl text-lg text-dawn/75">{a.tagline}</p>}
          {a.welcomeVerse && <p className="mt-5 max-w-2xl font-display text-xl italic text-dawn/90">{a.welcomeVerse}</p>}
          <Link to={`/a/${slug}`} className="mt-6 inline-flex items-center gap-1.5 text-sm text-gold-light hover:underline"><ExternalLink className="h-3.5 w-3.5" />Public academy page</Link>
        </div>
      </section>

      <nav className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Academy sections">
        {tiles.map(({ to, icon: Icon, label, text }) => (
          <Link key={to} to={to} className="panel p-5 hover:border-gold/60">
            <Icon className="h-6 w-6 text-gold-deep" />
            <p className="mt-3 font-semibold text-night">{label}</p>
            <p className="text-xs text-ink-muted">{text}</p>
          </Link>
        ))}
      </nav>

      <MembersOnly>
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <section>
            <h2 className="mb-4 font-display text-3xl font-semibold text-night">Latest courses</h2>
            <div className="panel divide-y divide-dawn-200">
              {(courses.data || []).slice(0, 5).map((c) => (
                <Link key={c.id} to={`courses/${c.slug}`} className="flex items-center justify-between gap-4 p-4 hover:bg-dawn/50">
                  <div><p className="font-semibold text-night">{c.title}</p><p className="text-xs text-ink-muted">{c.lessonCount} lessons{c.status !== 'published' ? ` · ${c.status}` : ''}</p></div>
                  {c.enrollment ? <span className="text-sm font-semibold text-emerald">{c.enrollment.progressPct}%</span> : <span className="text-sm text-ink-muted">Not started</span>}
                </Link>
              ))}
              {!courses.loading && !courses.data?.length && <p className="p-5 text-sm text-ink-muted">No courses published yet.</p>}
            </div>
          </section>
          <section className="space-y-8">
            <div>
              <h2 className="mb-4 font-display text-3xl font-semibold text-night">Coming up</h2>
              <div className="panel divide-y divide-dawn-200">
                {(meetings.data || []).slice(0, 4).map((m) => (
                  <Link key={m.id} to={`meetings/${m.id}`} className="block p-4 hover:bg-dawn/50"><p className="font-medium text-night">{m.title}</p><p className="text-xs text-ink-muted">{MEETING_LABEL[m.type]}, {fmtDateTime(m.startsAt)}</p></Link>
                ))}
                {!meetings.loading && !meetings.data?.length && <p className="p-5 text-sm text-ink-muted">Nothing scheduled.</p>}
              </div>
            </div>
            {ann.data?.length > 0 && (
              <div>
                <h2 className="mb-4 font-display text-3xl font-semibold text-night">Announcements</h2>
                <ul className="space-y-3">{ann.data.slice(0, 3).map((x) => <li key={x.id} className="panel p-4"><p className="flex items-center gap-2 font-semibold text-night"><Megaphone className="h-4 w-4 text-gold-deep" />{x.title}</p>{x.body && <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{x.body}</p>}<p className="mt-1 text-xs text-ink-soft">{x.author?.fullName}, {ago(x.publishedAt)}</p></li>)}</ul>
              </div>
            )}
          </section>
        </div>
      </MembersOnly>
    </div>
  );
}
