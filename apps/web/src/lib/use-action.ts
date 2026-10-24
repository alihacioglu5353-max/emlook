"use client";

import { useCallback, useState } from "react";

/**
 * Düğmelere bağlı tek seferlik işlemler için: hangi işlemin sürdüğünü ve son
 * hatayı tutar. `run("approve:123", () => api(...))`
 */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(key);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return undefined;
    } finally {
      setBusy(null);
    }
  }, []);

  return { run, busy, error, clearError: () => setError(null) };
}
