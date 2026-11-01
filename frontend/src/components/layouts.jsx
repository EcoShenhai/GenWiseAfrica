import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams, Navigate } from 'react-router-dom';
import {
  Menu, X, Home, BookOpen, Mic2, Video, HeartHandshake, Flame, Award, Settings, Shield, LogOut, Bell, ChevronDown, Plus, Compass, UserRound, LayoutGrid,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api, post } from '../lib/api';
import { Logo, Avatar, PageLoader } from './ui';
import { ago } from '../lib/format';

/* ================================================================== public */
export function PublicLayout() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const dark = loc.pathname === '/';
  const links = [
    { to: '/academies', label: 'Academies' },
    { to: '/#features', label: 'What you can do' },
    { to: '/#churches', label: 'For churches' },
    { to: '/#pricing', label: 'Pricing' },
  ];
  return (
    <div className="flex min-h-screen flex-col">
      <header className={`${dark ? 'absolute inset-x-0 top-0 z-30' : 'border-b border-dawn-200 bg-white'}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Logo light={dark} size={42} />
          <nav className="hidden items-center gap-7 text-sm md:flex" aria-label="Main">
            {links.map((l) => <a key={l.to} href={l.to} className={dark ? 'text-dawn/80 hover:text-gold-light' : 'text-ink-muted hover:text-night'}>{l.label}</a>)}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            {user ? <Link to="/app" className={dark ? 'btn-gold' : 'btn-primary'}>Open my dashboard</Link> : (
              <>
                <Link to="/login" className={dark ? 'btn text-dawn hover:text-gold-light' : 'btn-ghost'}>Sign in</Link>
                <Link to="/register" className={dark ? 'btn-gold' : 'btn-primary'}>Create account</Link>
              </>
            )}
          </div>
          <button type="button" className={`md:hidden ${dark ? 'text-gold-light' : 'text-night'}`} onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>{open ? <X /> : <Menu />}</button>
        </div>
        {open && (
          <div className="mx-4 mb-3 rounded-2xl bg-white p-4 shadow-xl md:hidden">
            {links.map((l) => <a key={l.to} href={l.to} className="block rounded-lg px-3 py-2.5 text-night hover:bg-dawn">{l.label}</a>)}
            <div className="mt-3 grid grid-cols-2 gap-2">
              {user ? <Link to="/app" className="btn-primary col-span-2">Open my dashboard</Link> : (<><Link to="/login" className="btn-outline">Sign in</Link><Link to="/register" className="btn-primary">Create account</Link></>)}
            </div>
          </div>
        )}
      </header>
      <main className="flex-1"><Outlet /></main>
      <Footer />
    </div>
  );
}

export function Footer() {
  return (
    <footer className="bg-night text-dawn/70">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo light size={46} />
          <p className="mt-5 max-w-sm font-display text-xl italic text-gold-light">Think Wise. Live Wise. Lead Generations.</p>
          <p className="mt-3 max-w-sm text-sm">A home for Christian mentorship and learning across Africa, built for churches, ministries and mentors.</p>
        </div>
        <div className="text-sm">
          <p className="mb-3 font-semibold text-dawn">Platform</p>
          <ul className="space-y-2">
            <li><Link to="/academies" className="hover:text-gold-light">Browse academies</Link></li>
            <li><Link to="/start-academy" className="hover:text-gold-light">Start an academy</Link></li>
            <li><Link to="/verify" className="hover:text-gold-light">Verify a certificate</Link></li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="mb-3 font-semibold text-dawn">Contact</p>
          <ul className="space-y-2">
            <li><a href="mailto:support@genwiseafrica.org" className="hover:text-gold-light">support@genwiseafrica.org</a></li>
            <li>Nairobi, Kenya</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-gold/20">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-4 py-5 text-xs sm:px-6">
          <span>© {new Date().getFullYear()} GenWise Africa</span>
          <span>“The fear of the LORD is the beginning of wisdom.” Proverbs 9:10</span>
        </div>
      </div>
    </footer>
  );
}

/* ================================================================== app shell */
export function RequireAuth({ children, superAdmin = false }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <PageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (superAdmin && !user.isSuperAdmin) return <Navigate to="/app" replace />;
  return children;
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ items: [], unread: 0 });
  const nav = useNavigate();
  const load = () => api('/me/notifications').then(setData).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);
  return (
    <div className="relative">
      <button type="button" onClick={() => { setOpen(!open); if (!open && data.unread) post('/me/notifications/read-all').then(() => setData((d) => ({ ...d, unread: 0 }))); }}
        className="relative rounded-full p-2 text-ink-muted hover:bg-dawn" aria-label={`Notifications${data.unread ? ` (${data.unread} unread)` : ''}`}>
        <Bell className="h-5 w-5" />
        {data.unread > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-gold ring-2 ring-white" />}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[90vw] rounded-2xl border border-dawn-200 bg-white p-2 shadow-xl">
          <p className="px-3 py-2 text-sm font-semibold text-night">Notifications</p>
          <div className="max-h-96 overflow-y-auto">
            {data.items.length === 0 && <p className="px-3 py-6 text-center text-sm text-ink-muted">You are all caught up.</p>}
            {data.items.map((n) => (
              <button key={n.id} type="button" onClick={() => { setOpen(false); if (n.link) nav(n.link); }} className="block w-full rounded-xl px-3 py-2.5 text-left hover:bg-dawn">
                <p className="text-sm font-medium text-night">{n.title}</p>
                {n.body && <p className="line-clamp-2 text-xs text-ink-muted">{n.body}</p>}
                <p className="mt-0.5 text-[11px] text-ink-soft">{ago(n.createdAt)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AcademySwitcher({ current }) {
  const { memberships } = useAuth();
  const [open, setOpen] = useState(false);
  const active = memberships.filter((m) => m.status === 'active');
  const cur = active.find((m) => m.tenant.slug === current);
  return (
    <div className="relative px-3">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 rounded-xl bg-night-700 px-3 py-2.5 text-left hover:bg-night-600" aria-expanded={open}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/15 font-display text-lg font-bold text-gold">{(cur?.tenant.name || 'G')[0]}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-dawn">{cur ? cur.tenant.name : 'Choose an academy'}</span>{cur && <span className="block text-[11px] text-dawn/60">{cur.role.replace('_', ' ')}</span>}</span>
        <ChevronDown className="h-4 w-4 text-dawn/60" />
      </button>
      {open && (
        <div className="absolute left-3 right-3 z-40 mt-1 rounded-xl bg-white p-1.5 shadow-xl">
          {active.map((m) => <Link key={m.tenant.id} to={`/app/a/${m.tenant.slug}`} onClick={() => setOpen(false)} className="block truncate rounded-lg px-3 py-2 text-sm text-night hover:bg-dawn">{m.tenant.name}{m.tenant.status !== 'active' && <span className="ml-1 text-xs text-gold-deep">(pending)</span>}</Link>)}
          <Link to="/academies" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-emerald hover:bg-dawn"><Compass className="h-4 w-4" />Find an academy</Link>
          <Link to="/start-academy" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-emerald hover:bg-dawn"><Plus className="h-4 w-4" />Start an academy</Link>
        </div>
      )}
    </div>
  );
}

const navCls = ({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${isActive ? 'bg-gold/15 text-gold-light' : 'text-dawn/75 hover:bg-night-700 hover:text-dawn'}`;

export function AppLayout() {
  const { user, logout, memberships } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  const m = loc.pathname.match(/^\/app\/a\/([^/]+)/);
  const slug = m?.[1] || memberships.find((x) => x.status === 'active')?.tenant.slug;
  const mem = memberships.find((x) => x.tenant.slug === slug);
  const canManage = user?.isSuperAdmin || ['owner', 'admin'].includes(mem?.role);
  useEffect(() => setOpen(false), [loc.pathname]);

  const sidebar = (
    <aside className="flex h-full w-64 flex-col bg-night py-5">
      <div className="px-5 pb-5"><Logo light size={36} to="/app" /></div>
      <AcademySwitcher current={slug} />
      <nav className="mt-5 flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="App">
        <NavLink end to="/app" className={navCls}><Home className="h-4 w-4" />My dashboard</NavLink>
        {slug && (
          <>
            <p className="px-3 pb-1 pt-4 text-[11px] text-dawn/40">Academy</p>
            <NavLink end to={`/app/a/${slug}`} className={navCls}><LayoutGrid className="h-4 w-4" />Overview</NavLink>
            <NavLink to={`/app/a/${slug}/courses`} className={navCls}><BookOpen className="h-4 w-4" />Courses</NavLink>
            <NavLink to={`/app/a/${slug}/meetings`} className={navCls}><Video className="h-4 w-4" />Live classes &amp; meetings</NavLink>
            <NavLink to={`/app/a/${slug}/podcasts`} className={navCls}><Mic2 className="h-4 w-4" />Podcasts</NavLink>
            <NavLink to={`/app/a/${slug}/mentorship`} className={navCls}><HeartHandshake className="h-4 w-4" />Mentorship</NavLink>
            <NavLink to={`/app/a/${slug}/prayer`} className={navCls}><Flame className="h-4 w-4" />Prayer</NavLink>
            {canManage && <NavLink to={`/app/a/${slug}/manage`} className={navCls}><Settings className="h-4 w-4" />Manage academy</NavLink>}
          </>
        )}
        <p className="px-3 pb-1 pt-4 text-[11px] text-dawn/40">Me</p>
        <NavLink to="/app/certificates" className={navCls}><Award className="h-4 w-4" />Certificates</NavLink>
        <NavLink to="/app/profile" className={navCls}><UserRound className="h-4 w-4" />Profile</NavLink>
        {user?.isSuperAdmin && <NavLink to="/admin" className={navCls}><Shield className="h-4 w-4" />Super admin</NavLink>}
      </nav>
      <div className="mx-3 mt-3 flex items-center gap-3 rounded-xl bg-night-700 p-3">
        <Avatar name={user?.fullName} src={user?.avatarUrl} size={34} />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-dawn">{user?.fullName}</p><p className="truncate text-[11px] text-dawn/50">{user?.email}</p></div>
        <button type="button" onClick={async () => { await logout(); nav('/'); }} className="rounded-lg p-1.5 text-dawn/60 hover:bg-night-600 hover:text-dawn" aria-label="Sign out" title="Sign out"><LogOut className="h-4 w-4" /></button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen lg:flex">
      <div className="sticky top-0 hidden h-screen lg:block">{sidebar}</div>
      {open && <div className="fixed inset-0 z-40 flex lg:hidden"><div className="h-full">{sidebar}</div><button type="button" aria-label="Close menu" className="flex-1 bg-night/50" onClick={() => setOpen(false)} /></div>}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-dawn-200 bg-white/90 px-4 py-2.5 backdrop-blur sm:px-8">
          <button type="button" className="rounded-lg p-2 text-night lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <div className="hidden text-sm text-ink-muted lg:block">{mem ? mem.tenant.name : 'Welcome'}</div>
          <div className="flex items-center gap-1">
            <Link to="/" className="btn-ghost btn-sm hidden sm:inline-flex">Home page</Link>
            <NotificationBell />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8"><Outlet /></main>
      </div>
    </div>
  );
}

/** Small helper for pages under /app/a/:slug */
export function useSlug() { return useParams().slug; }
