import { useCallback, useEffect, useState } from "react";

// Standardizes the loading/error/data pattern so pages stop doing bare
// `api.getX().then(setX)` calls that hang forever and show nothing if the
// request fails (expired token, backend down, etc).
//
// Usage:
//   const { data: medicines, loading, error, reload } = useAsyncData(
//     () => api.getMedicines({ status, search }),
//     [status, search]
//   );
export function useAsyncData(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetcher()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => load(), [load]);

  return { data, loading, error, reload: load };
}
