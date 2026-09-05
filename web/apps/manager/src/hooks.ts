import { useCallback, useEffect, useState } from 'react';
import { apiFetch, type CheckStatus, type ConfigResponse, type DashboardConfig, type Service, type ServicesResponse } from '@server/ui';

export function useServices(): { services: Service[]; load: () => Promise<Service[]> } {
  const [services, setServices] = useState<Service[]>([]);
  const load = useCallback(async () => {
    const d = await apiFetch<ServicesResponse>('/api/services');
    setServices(d.services || []);
    return d.services || [];
  }, []);
  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);
  return { services, load };
}

export function usePresets(): string[] {
  const [presets, setPresets] = useState<string[]>([]);
  useEffect(() => {
    apiFetch<{ presets: string[] }>('/api/presets')
      .then(d => setPresets(d.presets || []))
      .catch(() => undefined);
  }, []);
  return presets;
}

export function useCheck(): CheckStatus {
  const [status, setStatus] = useState<CheckStatus>({});
  useEffect(() => {
    const check = async () => {
      try {
        setStatus(await apiFetch<CheckStatus>('/api/check'));
      } catch {
        /* caddy fora */
      }
    };
    check();
    const id = setInterval(check, 20000);
    return () => clearInterval(id);
  }, []);
  return status;
}

export function useConfig(): {
  cfg: DashboardConfig | null;
  load: () => Promise<void>;
  save: (c: DashboardConfig) => Promise<DashboardConfig | null>;
} {
  const [cfg, setCfg] = useState<DashboardConfig | null>(null);
  const load = useCallback(async () => {
    const d = await apiFetch<ConfigResponse>('/api/config');
    setCfg(d.config);
  }, []);
  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);
  const save = useCallback(async (c: DashboardConfig) => {
    try {
      const d = await apiFetch<ConfigResponse & { ok?: boolean }>('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c),
      });
      setCfg(d.config);
      return d.config;
    } catch {
      return null;
    }
  }, []);
  return { cfg, load, save };
}