import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, post, refreshSession, setAccessToken, onSessionLost } from './api';

const AuthCtx = createContext(null);
const PENDING = 'gw_pending_code';

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, memberships: [], ready: false });

  const apply = useCallback((data) => {
    if (data?.accessToken) setAccessToken(data.accessToken);
    setState({ user: data?.user || null, memberships: data?.memberships || [], ready: true });
  }, []);

  useEffect(() => {
    refreshSession().then(apply).catch(() => setState((s) => ({ ...s, ready: true })));
    return onSessionLost(() => setState({ user: null, memberships: [], ready: true }));
  }, [apply]);

  const reload = useCallback(async () => {
    const d = await api('/auth/me');
    setState((s) => ({ ...s, user: d.user, memberships: d.memberships }));
    return d;
  }, []);

  const logout = useCallback(async () => {
    try { await post('/auth/logout'); } catch { /* ignore */ }
    setAccessToken(null);
    setState({ user: null, memberships: [], ready: true });
  }, []);

  const value = useMemo(() => ({
    ...state, apply, reload, logout,
    savePending: (p) => sessionStorage.setItem(PENDING, JSON.stringify(p)),
    readPending: () => { try { return JSON.parse(sessionStorage.getItem(PENDING) || 'null'); } catch { return null; } },
    clearPending: () => sessionStorage.removeItem(PENDING),
    membershipFor: (slug) => state.memberships.find((m) => m.tenant?.slug === slug),
  }), [state, apply, reload, logout]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
