import { useEffect, useRef, useState } from 'react';
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
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLAnchorElement>(null);
  const maint = st === 'maint';
  const offline = st === 'offline' || st === 'off';
  const cls = 'dock-item' + (maint ? ' maintenance' : offline ? ' offline' : '') + (show ? ' pop-open' : '');

  useEffect(() => {
    if (!show) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [show]);

  const label = svc.name + (maint ? ' · em manutenção' : offline ? ' · offline' : '');

  return (
    <a
      ref={ref}
      className={cls}
      href={svc.route}
      aria-label={label}
      onClick={e => {
        if (offline && !maint) {
          e.preventDefault();
          return;
        }
        if (!show) {
          e.preventDefault();
          setShow(true);
        }
      }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className="dock-pop">{label}</span>
      <span className="dock-icon">
        <img src={BASE + '/' + svc.logo} alt={svc.name} />
      </span>
    </a>
  );
}