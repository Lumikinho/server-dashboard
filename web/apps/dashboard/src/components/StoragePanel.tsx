import type { SystemStatus } from '@server/ui';
import { Panel } from './Panel';

export function StoragePanel({ disks }: { disks?: SystemStatus['storage'] }) {
  return (
    <Panel title="Armazenamento">
      <div>
        {(disks || []).map(s => {
          const cls = s.pct >= 90 ? 'crit' : s.pct >= 75 ? 'warn' : '';
          return (
            <div className="disk" key={s.mount}>
              <div className="disk-head">
                <span className="mount">{s.mount}</span>
                <span className="vals">
                  {s.used_gb} / {s.total_gb} GB · {s.pct}%
                </span>
              </div>
              <div className="bar">
                <div className={cls} style={{ width: s.pct + '%' }} />
              </div>
            </div>
          );
        })}
        {!disks ? <div style={{ color: '#555', fontSize: '0.85rem' }}>carregando…</div> : null}
      </div>
    </Panel>
  );
}