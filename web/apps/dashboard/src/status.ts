import { useEffect, useState } from 'react';
import { BASE, type Service } from '@server/ui';

export type Probe = { ok: boolean; ms: number | null };
export type StatusKey = 'online' | 'offline' | 'maint' | 'off' | 'unknown';

export function statusOf(s: Service, probes: Record<string, Probe | undefined>): StatusKey {
  if (s.enabled === false) return 'off';
  if (s.maintenance) return 'maint';
  const p = probes[s.route];
  if (!p) return 'unknown';
  return p.ok ? 'online' : 'offline';
}

/**
 * Mede a latência real de cada serviço ativo (mesma origem, via Caddy)
 * com cadência eco-aware. Compartilhado pelo dock e pelo ecossistema.
 */
export function useServiceProbe(services: Service[], eco: boolean): Record<string, Probe | undefined> {
  const [probes, setProbes] = useState<Record<string, Probe | undefined>>({});
  useEffect(() => {
    const alvos = services.filter(s => s.enabled !== false && !s.maintenance);
    let stopped = false;
    const probe = async (route: string): Promise<{ ok: boolean; ms: number | null }> => {
      const t0 = performance.now();
      let status = 0;
      try {
        const head = await fetch(BASE + route, { method: 'HEAD', cache: 'no-store' });
        status = head.status;
        if (head.ok) return { ok: true, ms: Math.round(performance.now() - t0) };
      } catch {
        return { ok: false, ms: null };
      }
      if (status !== 404 && status !== 405) {
        return { ok: false, ms: Math.round(performance.now() - t0) };
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      try {
        const get = await fetch(BASE + route, { method: 'GET', cache: 'no-store', signal: ctrl.signal });
        return { ok: get.ok, ms: Math.round(performance.now() - t0) };
      } catch {
        return { ok: false, ms: null };
      } finally {
        clearTimeout(timer);
      }
    };
    const one = async (route: string) => {
      const r = await probe(route);
      if (!stopped) setProbes(p => ({ ...p, [route]: r }));
    };
    alvos.forEach(s => one(s.route));
    const id = setInterval(() => alvos.forEach(s => one(s.route)), eco ? 90000 : 30000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [services, eco]);
  return probes;
}