import { createContext, useContext } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import { Clock, Lock } from 'lucide-react';
import { useApi } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import { post } from '../../lib/api';
import { Empty, PageLoader } from '../../components/ui';

const Ctx = createContext(null);
export const useAcademy = () => useContext(Ctx);

export function AcademyLayout() {
  const { slug } = useParams();
  const { reload: reloadAuth } = useAuth();
  const { data, loading, error, reload } = useApi(`/t/${slug}`);
  if (loading && !data) return <PageLoader />;
  if (error) return <Empty title="Academy not available">{error.message}</Empty>;
  const value = { slug, academy: data.academy, membership: data.membership, caps: data.caps, reload: async () => { await reload(); await reloadAuth(); } };
  return (
    <Ctx.Provider value={value}>
      {data.academy.status !== 'active' && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-gold/40 bg-gold-pale/50 px-4 py-3 text-sm text-night">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{data.academy.status === 'pending' ? 'This academy is awaiting approval by the GenWise team. You can prepare courses and content now; members can join once it is approved.' : `This academy is ${data.academy.status}. ${data.academy.statusNote || ''}`}</p>
        </div>
      )}
      <Outlet />
    </Ctx.Provider>
  );
}

/** Shows a join prompt when the viewer is not an active member */
export function MembersOnly({ children }) {
  const { caps, membership, academy, slug, reload } = useAcademy();
  if (caps.member) return children;
  return (
    <Empty icon={Lock} title={membership?.status === 'pending' ? 'Your request is pending' : `Join ${academy.name} to continue`}
      action={membership?.status === 'pending' ? null : <button type="button" className="btn-primary" onClick={async () => { await post(`/t/${slug}/join`); await reload(); }}>{academy.joinPolicy === 'open' ? 'Join academy' : 'Request to join'}</button>}>
      {membership?.status === 'pending' ? 'An academy admin will review your request soon.' : 'Courses, live classes, mentorship and prayer are open to members.'}
      {' '}<Link className="link" to={`/a/${slug}`}>View public page</Link>
    </Empty>
  );
}
