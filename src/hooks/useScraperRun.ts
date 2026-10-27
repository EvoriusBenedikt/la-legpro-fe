import { useCallback, useEffect, useRef, useState } from 'react';
import api, { isHttpError } from '../services/api';
import { apiErrorMsg } from '../apiErrors';
import type { Msg } from '../i18n';

export interface ScraperResult {
  id: string;
  label: string;
  status: string;
  seconds: number;
}

type RunState = 'idle' | 'running' | 'completed' | 'failed';
interface RunResponse {
  state: RunState;
  results: ScraperResult[];
  error: string | null;
}

export function useScraperRun() {
  const [state, setState] = useState<RunState>('idle');
  const [results, setResults] = useState<ScraperResult[]>([]);
  const [error, setError] = useState<Msg | null>(null);
  const [starting, setStarting] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const apply = useCallback((data: RunResponse) => {
    setState(data.state);
    setResults(data.results || []);
    if (data.state === 'failed') setError({ key: 'scrRunFailed' });
  }, []);

  const poll = useCallback(async () => {
    try {
      const response = await api.get<RunResponse>('/api/scraper/run');
      apply(response.data);
    } catch (e) {
      setError(apiErrorMsg(e, 'scrRunError'));
    }
  }, [apply]);

  useEffect(() => {
    const initial = window.setTimeout(() => { void poll(); }, 0);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer.current);
    };
  }, [poll]);

  useEffect(() => {
    window.clearInterval(timer.current);
    if (state === 'running') {
      timer.current = window.setInterval(() => { void poll(); }, 3000);
    }
    return () => window.clearInterval(timer.current);
  }, [poll, state]);

  const run = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const response = await api.post<RunResponse>('/api/scraper/run');
      apply(response.data);
    } catch (e) {
      if (isHttpError(e) && e.response.status === 409) {
        setState('running');
        return;
      }
      setState('failed');
      setError(apiErrorMsg(e, 'scrRunError'));
    } finally {
      setStarting(false);
    }
  }, [apply]);

  return { run, state, results, error, starting };
}
