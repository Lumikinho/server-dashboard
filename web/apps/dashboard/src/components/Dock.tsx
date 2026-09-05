import type { CSSProperties } from 'react';
import { BASE, type Service } from '@server/ui';
import { statusOf, useServiceProbe } from '../status';

export function Dock({ services, eco }: { services: Service[]; eco: boolean }) {
  const items = services.filter(s => s.enabled !== false);
  const probes = useServiceProbe(items, eco);
  if (!items.length) return null;
  return (
    <div className="dock-wrap">
      <div className="dock">
        {items.map(s => (
          <DockItem key={s.route || s.name} svc={s} st={statusOf(s, probes)} />
        ))}
      </div>
    </div>
  );
}

export function DockItem({ svc, st }: { svc: Service; st: string }) {
  const maint = st === 'maint';
  const offline = st === 'offline' || st === 'off';
  const label = svc.name + (maint ? ' · em manutenção' : offline ? ' · offline' : '');
  const cls = 'dock-item' + (maint ? ' maintenance' : offline ? ' offline' : '');

  return (
    <a
      className={cls}
      href={svc.route}
      title={maint ? svc.name + ' · em manutenção' : svc.desc || svc.name}
      onClick={e => {
        if (offline && !maint) e.preventDefault();
      }}
    >
      <span className="dock-label">{label}</span>
      <span
        className="dock-icon"
        style={{ '--accent-bg': svc.accentBg || 'rgba(128,128,128,.12)' } as CSSProperties}
      >
        <img src={BASE + '/' + svc.logo} alt={svc.name} />
      </span>
    </a>
  );
}