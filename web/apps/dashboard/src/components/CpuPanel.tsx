import { useEffect, useRef } from 'react';
import type { SystemStatus } from '@server/ui';
import { drawSpark } from '../charts';
import { Panel } from './Panel';

export function CpuPanel({ c }: { c?: SystemStatus['cpu'] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cpu = c || {};
  const pct = cpu.pct;
  const barCls = pct != null && pct >= 90 ? 'crit' : pct != null && pct >= 70 ? 'warn' : '';

  useEffect(() => {
    if (ref.current) drawSpark(ref.current, cpu.history, '#38bdf8');
  }, [cpu.history]);

  return (
    <Panel title="CPU">
      <div className="batt-top">
        <div className="cpu-pct">{pct != null ? pct + '%' : '—'}</div>
        <div>
          <div className="batt-state">{(cpu.cores || '—') + ' núcleos'}</div>
          <div className="batt-state">{cpu.load1 != null ? `load ${cpu.load1} ${cpu.load5} ${cpu.load15}` : 'load —'}</div>
        </div>
      </div>
      <div className="bar" style={{ marginTop: '1rem' }}>
        <div className={barCls} style={{ width: (pct || 0) + '%' }} />
      </div>
      <canvas id="cpuChart" ref={ref} width={600} height={160} />
      <div className="chart-label">uso da CPU · últimos ~10 min</div>
    </Panel>
  );
}