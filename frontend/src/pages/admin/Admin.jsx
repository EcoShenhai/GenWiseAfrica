import { useState } from 'react';
import { NavLink, Route, Routes, Link } from 'react-router-dom';
import { useApi, useAction, useTitle } from '../../lib/hooks';
import { patch } from '../../lib/api';
import { fmtDate, fmtDateTime, fmtKes, TYPE_LABEL } from '../../lib/format';
import { Alert, Avatar, Badge, Empty, PageLoader, SectionHeader, useToast } from '../../components/ui';

const tab = ({ isActive }) => `whitespace-nowrap rounded-full px-4 py-1.5 text-sm ${isActive ? 'bg-night text-gold-light' : 'text-ink-muted hover:bg-white'}`;

function Overview() {
  const { data } = useApi('/admin/stats');
  if (!data) return <PageLoader />;
  const items = [
    ['Active academies', data.activeAcademies, data.pendingAcademies ? <Link className="link" to="academies">{data.pendingAcademies} awaiting approval</Link> : null],
    ['Users', data.users, `${data.newUsers30d} joined in the last 30 days`],
    ['Courses', data.courses, `${data.enrollments} enrolments`],
    ['Upcoming meetings', data.upcomingMeetings, null],
    ['M-Pesa confirmed', fmtKes(data.approvedKes), data.pendingPayments ? <Link className="link" to="payments">{data.pendingPayments} to review</Link> : null],
    ['AI tokens (30 days)', data.aiTokens30d.toLocaleString(), 'DeepSeek completion tokens'],
  ];
  return <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map(([l, v, n]) => <div key={l} className="panel p-5"><dt className="text-sm text-ink-muted">{l}</dt><dd className="mt-1 font-display text-4xl font-semibold text-night">{v}</dd>{n && <p className="mt-1 text-xs text-ink-muted">{n}</p>}</div>)}</dl>;
}

function Academies() {
  const [status, setStatus] = useState('pending');
  const { data, loading, reload } = useApi(`/admin/tenants${status ? `?status=${status}` : ''}`, [status]);
  const { error, run } = useAction();
  const { toast, toastEl } = useToast();
  const set = (t, s) => run(async () => { const note = s === 'active' ? undefined : window.prompt('Note to the academy owner (optional)') || undefined; await patch(`/admin/tenants/${t.id}`, { status: s, statusNote: note }); reload(); toast(`${t.name}: ${s}`); }).catch(() => {});
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">{['pending', 'active', 'suspended', 'rejected', ''].map((s) => <button key={s || 'all'} type="button" onClick={() => setStatus(s)} className={`chip ${status === s ? 'bg-night text-gold-light' : 'border border-dawn-200 bg-white text-ink-muted'}`}>{s || 'all'}</button>)}</div>
      <Alert>{error}</Alert>
      {loading ? <PageLoader /> : data?.length ? (
        <ul className="space-y-3">
          {data.map((t) => (
            <li key={t.id} className="panel flex flex-wrap items-center gap-4 p-5">
              <div className="min-w-0 flex-1">
                <p className="font-display text-2xl font-semibold text-night">{t.name} <Badge tone={t.status === 'active' ? 'emerald' : t.status === 'pending' ? 'gold' : 'red'}>{t.status}</Badge></p>
                <p className="text-sm text-ink-muted">{TYPE_LABEL[t.type]} · {[t.city, t.country].filter(Boolean).join(', ')} · /{t.slug} · applied {fmtDate(t.createdAt)} · plan {t.planCode}</p>
                <p className="text-sm text-ink-muted">Owner: {t.owner?.fullName} ({t.owner?.email}{t.owner?.phone ? `, ${t.owner.phone}` : ''})</p>
                {t.tagline && <p className="mt-1 text-sm text-ink">{t.tagline}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {t.status !== 'active' && <button type="button" className="btn-primary btn-sm" onClick={() => set(t, 'active')}>Approve</button>}
                {t.status === 'pending' && <button type="button" className="btn-outline btn-sm" onClick={() => set(t, 'rejected')}>Reject</button>}
                {t.status === 'active' && <button type="button" className="btn-danger btn-sm" onClick={() => set(t, 'suspended')}>Suspend</button>}
                <Link className="btn-ghost btn-sm" to={`/app/a/${t.slug}`}>Open</Link>
              </div>
            </li>
          ))}
        </ul>
      ) : <Empty title={`No ${status || ''} academies`} />}
      {toastEl}
    </div>
  );
}

function Payments() {
  const [status, setStatus] = useState('pending');
  const { data, loading, reload } = useApi(`/admin/payments${status ? `?status=${status}` : ''}`, [status]);
  const { error, run } = useAction();
  const review = (p, s) => run(async () => { const notes = s === 'rejected' ? window.prompt('Reason (sent to the academy)') || undefined : undefined; await patch(`/admin/payments/${p.id}`, { status: s, notes }); reload(); }).catch(() => {});
  return (
    <div>
      <p className="mb-4 text-sm text-ink-muted">Check each code against the M-Pesa statement for 254702122874 before approving.</p>
      <div className="mb-4 flex gap-2">{['pending', 'approved', 'rejected', ''].map((s) => <button key={s || 'all'} type="button" onClick={() => setStatus(s)} className={`chip ${status === s ? 'bg-night text-gold-light' : 'border border-dawn-200 bg-white text-ink-muted'}`}>{s || 'all'}</button>)}</div>
      <Alert>{error}</Alert>
      {loading ? <PageLoader /> : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-dawn-200 text-left text-ink-muted"><th className="px-4 py-3">M-Pesa code</th><th>Amount</th><th>Academy</th><th>Payer</th><th>For</th><th>Submitted</th><th className="px-4 text-right" /></tr></thead>
            <tbody>
              {(data || []).map((p) => (
                <tr key={p.id} className="border-b border-dawn-200 last:border-0">
                  <td className="px-4 py-3 font-mono font-semibold text-night">{p.mpesaCode}</td>
                  <td className="font-semibold">{fmtKes(p.amountKes)}</td>
                  <td>{p.Tenant?.name}</td>
                  <td><p>{p.payerName}</p><p className="text-xs text-ink-muted">{p.payerPhone}</p></td>
                  <td>{p.kind}{p.planCode ? ` (${p.planCode})` : ''}</td>
                  <td className="text-ink-muted">{fmtDateTime(p.createdAt)}</td>
                  <td className="px-4 text-right">{p.status === 'pending' ? <><button type="button" className="btn-primary btn-sm mr-1" onClick={() => review(p, 'approved')}>Approve</button><button type="button" className="btn-ghost btn-sm" onClick={() => review(p, 'rejected')}>Reject</button></> : <Badge tone={p.status === 'approved' ? 'emerald' : 'red'}>{p.status}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.length && <p className="p-6 text-center text-sm text-ink-muted">No {status} payments.</p>}
        </div>
      )}
    </div>
  );
}

function Users() {
  const [q, setQ] = useState('');
  const { data, reload } = useApi(`/admin/users?q=${encodeURIComponent(q)}`, [q]);
  const { error, run } = useAction();
  return (
    <div>
      <input className="input mb-4 max-w-sm" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
      <Alert>{error}</Alert>
      <div className="panel divide-y divide-dawn-200">
        {(data?.items || []).map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 p-4">
            <Avatar name={u.fullName} src={u.avatarUrl} size={34} />
            <div className="min-w-0 flex-1"><p className="font-medium text-night">{u.fullName} {u.isSuperAdmin && <Badge tone="night">super admin</Badge>} {u.status !== 'active' && <Badge tone="red">{u.status}</Badge>}</p><p className="text-xs text-ink-muted">{u.email} · joined {fmtDate(u.createdAt)}{u.emailVerified ? '' : ' · email not verified'}</p></div>
            <button type="button" className="btn-ghost btn-sm" onClick={() => run(async () => { await patch(`/admin/users/${u.id}`, { status: u.status === 'active' ? 'suspended' : 'active' }); reload(); }).catch(() => {})}>{u.status === 'active' ? 'Suspend' : 'Reactivate'}</button>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-muted">{data?.total ?? 0} users</p>
    </div>
  );
}

function Audit() {
  const { data } = useApi('/admin/audit');
  return (
    <div className="panel divide-y divide-dawn-200 text-sm">
      {(data || []).map((a) => <div key={a.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5"><span><b className="text-night">{a.action}</b> <span className="text-ink-muted">{a.actor?.fullName || 'system'}{a.entityType ? ` · ${a.entityType}` : ''}</span></span><span className="text-xs text-ink-muted">{fmtDateTime(a.createdAt)} · {a.ip}</span></div>)}
    </div>
  );
}

export default function Admin() {
  useTitle('Super admin');
  return (
    <div>
      <SectionHeader title="Super admin">Platform oversight for GenWise Africa.</SectionHeader>
      <nav className="mb-6 flex gap-1 overflow-x-auto rounded-full bg-dawn-200/60 p-1" aria-label="Admin sections">
        <NavLink end to="/admin" className={tab}>Overview</NavLink>
        <NavLink to="/admin/academies" className={tab}>Academies</NavLink>
        <NavLink to="/admin/payments" className={tab}>M-Pesa payments</NavLink>
        <NavLink to="/admin/users" className={tab}>Users</NavLink>
        <NavLink to="/admin/audit" className={tab}>Audit log</NavLink>
      </nav>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="academies" element={<Academies />} />
        <Route path="payments" element={<Payments />} />
        <Route path="users" element={<Users />} />
        <Route path="audit" element={<Audit />} />
      </Routes>
    </div>
  );
}
