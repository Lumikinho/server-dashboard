import { useCallback, useEffect, useState } from 'react';

export interface EcoState {
  eco: boolean;
  automatic: boolean;
  override: 'on' | 'off' | null;
  toggle: () => void;
}

interface DeviceBattery {
  charging: boolean;
  level: number;
  addEventListener: (type: string, listener: () => void) => void;
}

/**
 * Modo economia: decide por sinais REAIS do dispositivo
 * (Battery Status API, saveData, rede 2G) com override manual.
 */
export function useEco(): EcoState {
  const [eco, setEco] = useState<boolean>(() => localStorage.getItem('eco') === '1');
  const [autoEco, setAutoEco] = useState(false);
  const [override, setOverride] = useState<'on' | 'off' | null>(null);
  const [batt, setBatt] = useState<{ charging: boolean; level: number } | null>(null);

  useEffect(() => {
    if (!('getBattery' in navigator)) return;
    const nav = navigator as unknown as { getBattery(): Promise<DeviceBattery> };
    nav
      .getBattery()
      .then(bat => {
        setBatt({ charging: bat.charging, level: bat.level });
        bat.addEventListener('levelchange', () => setBatt({ charging: bat.charging, level: bat.level }));
        bat.addEventListener('chargingchange', () => setBatt({ charging: bat.charging, level: bat.level }));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const conn = (navigator as unknown as {
      connection?: { saveData?: boolean; effectiveType?: string; addEventListener?: (t: string, fn: () => void) => void };
    }).connection;
    if (!conn) return;
    const update = () => {
      const now =
        (batt != null && batt.charging === false && batt.level <= 0.25) ||
        !!conn.saveData ||
        conn.effectiveType === '2g' ||
        conn.effectiveType === 'slow-2g';
      setAutoEco(now);
    };
    conn.addEventListener?.('change', update);
    update();
  }, [batt]);

  const target = override == null ? autoEco : override === 'on';

  useEffect(() => {
    setEco(target);
    localStorage.setItem('eco', target ? '1' : '0');
  }, [target]);

  const toggle = useCallback(() => {
    setOverride(eco ? 'off' : 'on');
  }, [eco]);

  return { eco, automatic: override == null && autoEco, override, toggle };
}