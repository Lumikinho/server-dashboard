import { useCallback, useEffect, useState } from 'react';
import { BASE, type Report, type Service, type SystemStatus } from '@server/ui';

/** Carrega services.json (a configuração usada pelo Caddy e pelo manager). */
export function useServices(): Service[] {
  const [services, setServices] = useState<Service[]>([]);
  useEffect(() => {
    let stopped = false;
    (async () => {
      try {
        const res = await fetch(BASE + '/services.json', { cache: 'no-store' });
        if (!res.ok) throw 0;
        const d = await res.json();
        if (!stopped) setServices(d.services || []);
      } catch {
        /* caddy fora */
      }
    })();
    return () => {
      stopped = true;
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