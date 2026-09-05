export const BASE: string = window.location.origin;

export async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, opts);
  let data: T | (Record<string, unknown> & { error?: string; message?: string }) = null as T;
  try {
    data = await r.json();
  } catch {
    data = {} as T;
  }
  if (!r.ok) {
    const e = (data as { error?: string }).error || ('HTTP ' + r.status);
    throw new Error(e);
  }
  return data as T;
}

export function logoUrl(logo?: string): string {
  return BASE + '/' + (logo || '');
}

export function escaped(s: string): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function fmtMem(mb?: number | null): string {
  if (mb == null) return '—';
  return mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb.toFixed(0) + ' MB';
}

export function fmtUptime(s?: number | null): string {
  if (s == null) return '—';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return (d ? d + 'd ' : '') + h + 'h ' + m + 'm online';
}

export function hexRgb(h: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(h).trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [128, 128, 128];
}

const ACCENT_PALETTE = [
  '#22c55e', '#00a4dc', '#a855f7', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#8b5cf6', '#84cc16', '#f97316',
];

export function accentForPort(port: number): string {
  return ACCENT_PALETTE[Math.abs(port) % ACCENT_PALETTE.length];
}