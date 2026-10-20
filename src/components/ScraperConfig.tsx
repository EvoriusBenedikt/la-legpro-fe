import { useCallback, useEffect, useState } from 'react';
import api, { isHttpError } from '../services/api';
import { apiErrorMsg } from '../apiErrors';
import { useStrings, fill, msg, type Msg } from '../i18n';
import LoadingOrb from './LoadingOrb';

interface Scraper {
  id: string;
  name: string;
  active: boolean;
}

interface ScraperResponse {
  scrapers: Scraper[];
}

type LoadState = 'loading' | 'unavailable' | 'error' | 'ready';

const retryable = (e: unknown): boolean => !isHttpError(e) || e.response.status >= 500;

export default function ScraperConfig() {
  const t = useStrings();
  const [state, setState] = useState<LoadState>('loading');
  const [scrapers, setScrapers] = useState<Scraper[]>([]);
  const [draft, setDraft] = useState<Scraper[]>([]);
  const [loadError, setLoadError] = useState<Msg | null>(null);
  const [loadRetry, setLoadRetry] = useState(false);
  const [saveError, setSaveError] = useState<Msg | null>(null);
  const [saveRetry, setSaveRetry] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    setLoadError(null);
    setLoadRetry(false);
    setSaved(false);
    try {
      const response = await api.get<ScraperResponse>('/api/scraper/config');
      const next = response.data.scrapers;
      setScrapers(next);
      setDraft(next.map(scraper => ({ ...scraper })));
      setState('ready');
    } catch (e) {
      if (isHttpError(e) && (e.response.status === 404 || e.response.status === 501)) {
        setState('unavailable');
      } else {
        setLoadError(apiErrorMsg(e, 'scrLoadError'));
        setLoadRetry(retryable(e));
        setState('error');
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const toggle = (id: string) => {
    setSaved(false);
    setDraft(current => current.map(scraper =>
      scraper.id === id ? { ...scraper, active: !scraper.active } : scraper
    ));
  };

  const dirty = draft.some((scraper, index) => scraper.active !== scrapers[index]?.active);

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveRetry(false);
    setSaved(false);
    try {
      const response = await api.put<ScraperResponse>('/api/scraper/config', {
        scrapers: draft.map(({ id, active }) => ({ id, active })),
      });
      const next = response.data.scrapers;
      setScrapers(next);
      setDraft(next.map(scraper => ({ ...scraper })));
      setSaved(true);
    } catch (e) {
      setSaveError(apiErrorMsg(e, 'scrSaveError'));
      setSaveRetry(retryable(e));
    } finally {
      setSaving(false);
    }
  };

  if (state === 'loading') {
    return <div className="admin-view scraper-view"><LoadingOrb label={t.appLoading} /></div>;
  }

  if (state === 'unavailable') {
    return <div className="admin-view scraper-view"><p className="scraper-feedback" role="status">{t.scrUnavailable}</p></div>;
  }

  if (state === 'error') {
    return (
      <div className="admin-view scraper-view">
        <h1 className="tax-title">{t.scrTitle}</h1>
        <div className="scraper-feedback scraper-feedback--error" role="alert">
          <span>{msg(t, loadError ?? { key: 'scrLoadError' })}</span>
          {loadRetry && <button type="button" className="btn btn-secondary" onClick={() => { void load(); }}>{t.taxRetry}</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-view scraper-view">
      <div className="tax-head">
        <div><h1 className="tax-title">{t.scrTitle}</h1></div>
        <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={() => { void save(); }}>
          {saving ? t.taxWorking : t.scrSave}
        </button>
      </div>

      {saveError && (
        <div className="scraper-feedback scraper-feedback--error" role="alert">
          <span>{msg(t, saveError)}</span>
          {saveRetry && <button type="button" className="btn btn-secondary" onClick={() => { void save(); }}>{t.taxRetry}</button>}
        </div>
      )}
      {saved && <p className="scraper-feedback scraper-feedback--success" role="status">{t.scrSaved}</p>}

      {draft.length === 0 ? <p className="scraper-feedback" role="status">{t.scrEmpty}</p> : (
        <div className="scraper-list">
          {draft.map(scraper => (
            <div className="scraper-row" key={scraper.id}>
              <div className="scraper-name">{scraper.name}</div>
              <span className={`status-chip ${scraper.active ? 'status-chip--success' : 'status-chip--neutral'}`}>
                {scraper.active ? t.scrActive : t.scrInactive}
              </span>
              <label className="scraper-toggle">
                <input
                  type="checkbox"
                  checked={scraper.active}
                  onChange={() => toggle(scraper.id)}
                  aria-label={fill(t.scrToggleAria, { name: scraper.name })}
                />
                <span aria-hidden="true" />
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
