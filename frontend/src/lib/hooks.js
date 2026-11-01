import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/** Load data from the API; returns { data, error, loading, reload, setData } */
export function useApi(path, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: !!path });
  const alive = useRef(true);
  const load = useCallback(async () => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api(path);
      if (alive.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (alive.current) setState({ data: null, error, loading: false });
    }
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; }; }, [load, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: load, setData: (d) => setState((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

/** Wrap an async action with busy/error state */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(async (fn) => {
    setBusy(true); setError(null);
    try { return await fn(); } catch (e) { setError(e.message || 'Something went wrong'); throw e; } finally { setBusy(false); }
  }, []);
  return { busy, error, setError, run };
}

export function useTitle(title) {
  useEffect(() => { document.title = title ? `${title} | GenWise Africa` : 'GenWise Africa — Generation of Wisdom'; }, [title]);
}
