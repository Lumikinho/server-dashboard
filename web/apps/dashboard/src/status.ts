import { useEffect, useState } from 'react';
import { BASE, type Service } from '@server/ui';

export type Probe = { ok: boolean; ms: number | null };
export type StatusKey = 'online' | 'offline' | 'maint' | 'off' | 'unknown';

export const ST_COLOR: Record<StatusKey, string> = {
  online: '#22c55e',
  offline: '#ef4444',
  maint: '#f59e0b',
  off: '#3a3a4a',
  unknown: '#555566',
};

export const ST_LABEL: Record<StatusKey, string> = {
  online: 'online',
  offline: 'offline',
  maint: 'em manutenção',
  off: 'desativado',
  unknown: '…',
};

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
    const one = async (route: string) => {
      const t0 = performance.now();
      try {
        const r = await fetch(BASE + route, { method: 'HEAD', cache: 'no-store' });
        if (!stopped) setProbes(p => ({ ...p, [route]: { ok: r.ok, ms: Math.round(performance.now() - t0) } }));
      } catch {
        if (!stopped) setProbes(p => ({ ...p, [route]: { ok: false, ms: null } }));
      }
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