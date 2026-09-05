import { useCallback, useEffect, useRef, useState } from 'react';
import { BASE, type DashboardConfig, type Report, type Service, type SystemStatus } from '@server/ui';

/** Carrega services.json (a configuração usada pelo Caddy e pelo manager) e
 *  mantém em sincronia com o manager (poll + refetch ao focar a janela). */
export function useServices(): Service[] {
  const [services, setServices] = useState<Service[]>([]);
  useEffect(() => {
    let stopped = false;
    const fetchIt = async () => {
      try {
        const res = await fetch(BASE + '/services.json', { cache: 'no-store' });
        if (!res.ok) throw 0;
        const d = await res.json();
        if (!stopped) setServices(d.services || []);
      } catch {
        /* caddy fora */
      }
    };
    fetchIt();
    const id = setInterval(fetchIt, 15000);
    const onFocus = () => void fetchIt();
    window.addEventListener('focus', onFocus);
    return () => {
      stopped = true;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, []);
  return services;
}

/** Status do sistema (bateria/CPU/armazenamento) via /system/status. */
export function useSystemStatus(eco: boolean): SystemStatus | null {
  const [sys, setSys] = useState<SystemStatus | null>(null);
  useEffect(() => {
    let stopped = false;
    const fetchIt = async () => {
      try {
        const res = await fetch(BASE + '/system/status', { cache: 'no-store' });
        if (!res.ok) throw 0;
        const d = await res.json();
        if (!stopped) setSys(d);
      } catch {
        /* sysinfo fora */
      }
    };
    fetchIt();
    const id = setInterval(fetchIt, eco ? 30000 : 5000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [eco]);
  return sys;
}

/** Relatório dos serviços via /system/report (com refresh manual). */
export function useReport(eco: boolean): { report: Report | null; refresh: () => Promise<void> } {
  const [report, setReport] = useState<Report | null>(null);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(BASE + '/system/report', { cache: 'no-store' });
      if (!res.ok) throw 0;
      setReport(await res.json());
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, eco ? 120000 : 30000);
    return () => clearInterval(id);
  }, [eco, refresh]);
  return { report, refresh };
}

export interface DashboardConfigApi {
  cfg: DashboardConfig | null;
  update: (fn: (c: DashboardConfig) => DashboardConfig) => Promise<boolean>;
}

/** Configuração do dashboard (widgets/aparência) — lê o static gerado pelo manager
 *  e grava de volta pelo proxy /dashboard/api/config. */
export function useConfig(): DashboardConfigApi {
  const [cfg, setCfg] = useState<DashboardConfig | null>(null);
  const ref = useRef<DashboardConfig | null>(null);

  const fetchIt = useCallback(async () => {
    try {
      const res = await fetch(BASE + '/dashboard-config.json', { cache: 'no-store' });
      if (!res.ok) throw 0;
      const d: DashboardConfig = await res.json();
      ref.current = d;
      setCfg(d);
    } catch {
      /* fora */
    }
  }, []);

  useEffect(() => {
    fetchIt();
    const id = setInterval(fetchIt, 15000);
    const onFocus = () => void fetchIt();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchIt]);

  const update = useCallback(async (fn: (c: DashboardConfig) => DashboardConfig): Promise<boolean> => {
    const cur = ref.current;
    if (!cur) return false;
    const next = fn(cur);
    try {
      const res = await fetch(BASE + '/dashboard/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
        cache: 'no-store',
      });
      if (!res.ok) throw 0;
      const d = await res.json();
      const saved: DashboardConfig = d.config || next;
      ref.current = saved;
      setCfg(saved);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { cfg, update };
}