import { useEffect, useRef } from 'react';
import type { BatteryInfo } from '@server/ui';
import { drawBatteryChart } from '../charts';
import { Panel } from './Panel';

export function BatteryPanel({ b, history }: { b?: BatteryInfo; history?: [number, number][] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const batt = b || {};
  const pct = batt.pct;
  const n = (history || []).length;
  const cls = 'batt-fill' + (pct != null && pct <= 20 ? ' low' : pct != null && pct < 50 ? ' mid' : '');

  useEffect(() => {
    if (ref.current) drawBatteryChart(ref.current, history);
  }, [history]);

  return (
    <Panel title="Bateria">
      <div className="batt-top">
        <div className="batt-icon">
          <div className={cls} style={{ width: (pct || 0) + '%' }} />
        </div>
        <div>
          <div className="batt-pct">{pct != null ? pct + '%' : '—'}</div>
          <div className="batt-state">
            {batt.charging ? (
              <>
                <span className="charging">● carregando</span> · {batt.status || ''}
              </>
            ) : (
              batt.status || '—'
            )}
          </div>
        </div>
      </div>
      <div className="batt-meta">
        <div>
          Tensão<span>{batt.voltage_v != null ? batt.voltage_v + ' V' : '—'}</span>
        </div>
        <div>
          Corrente<span>{batt.current_ma != null ? batt.current_ma + ' mA' : '—'}</span>
        </div>
        <div>
          Temperatura<span>{batt.temp_c != null ? batt.temp_c + ' °C' : '—'}</span>
        </div>
        <div>
          Saúde<span>{batt.health || '—'}{batt.tech ? ' · ' + batt.tech : ''}</span>
        </div>
      </div>
      <canvas id="battChart" ref={ref} width={600} height={220} />
      <div className="chart-label">{n > 1 ? `histórico da bateria · ${n} amostras · ~1/min` : 'histórico da bateria'}</div>
    </Panel>
  );
}