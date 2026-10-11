/* Live sidebar badge counts (2026-10-11 sidebar redesign).
   Only numbers the backend can vouch for: the pending-approval queue
   length, fetched for the roles the queue endpoint serves (sekretaris
   perusahaan + dewa, level ≥ 5). Any fetch failure yields null and the
   badge hides — the sidebar never shows a fabricated numeral. */
import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from './useAuth';
import { getRoleLevel } from '../navConfig';

export interface NavCounts {
  pending: number | null;
}

export function useNavCounts(): NavCounts {
  const { user } = useAuth();
  const level = user?.role ? getRoleLevel(user.role) : 1;
  const needed = level >= 5;
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    if (!needed) return;
    let alive = true;
    const load = () => {
      api.get('/api/repository/pending')
        .then((res) => {
          if (!alive) return;
          /* The endpoint serves { documents: [...] } (same shape
             LegalRepository's pending tab consumes); tolerate a bare
             array too so a future BE change degrades to a hidden
             badge, never a wrong numeral. */
          const d = res.data;
          const list = Array.isArray(d) ? d : Array.isArray(d?.documents) ? d.documents : null;
          setPending(list ? list.length : null);
        })
        .catch(() => {
          if (alive) setPending(null);
        });
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [needed]);

  /* Masked rather than reset-in-effect (eslint set-state-in-effect):
     roles without queue access simply never see a count. */
  return { pending: needed ? pending : null };
}
