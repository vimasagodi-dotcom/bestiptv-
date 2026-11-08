import { DependencyList, useCallback, useEffect, useState } from 'react';

export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fn()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e?.message ?? 'Ocorreu um erro'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, token]);

  const retry = useCallback(() => setToken((t) => t + 1), []);
  return { data, error, loading, retry };
}

