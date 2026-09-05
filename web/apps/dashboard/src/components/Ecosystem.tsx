import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ServiceIcon, type Service } from '@server/ui';
import { ST_COLOR, ST_LABEL, statusOf, useServiceProbe } from '../status';
import { Panel } from './Panel';

export function Ecosystem({ services, eco }: { services: Service[]; eco: boolean }) {
  return (
    <div className="eco-wrap-out">
      <Panel title="Ecossistema">
        <EcosystemGraph services={services} eco={eco} />
      </Panel>
    </div>
  );
}

function EcosystemGraph({ services, eco }: { services: Service[]; eco: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);
  const netRef = useRef<HTMLDivElement>(null);
  const sysRef = useRef<HTMLDivElement>(null);
  const mgrRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [mid, setMid] = useState<Record<string, { x: number; y: number }>>({});
  const probes = useServiceProbe(services, eco);

  /* mede as posições dos nós para desenhar as linhas do grafo */
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;
      setSize({ w: r.width, h: r.height });
      const c = (n: Element | null) => {
        if (!n) return null;
        const b = n.getBoundingClientRect();
        return { x: b.left - r.left + b.width / 2, y: b.top - r.top + b.height / 2 };
      };
      const m: Record<string, { x: number; y: number }> = {};
      const put = (k: string, n: Element | null) => {
        const p = c(n);
        if (p) m[k] = p;
      };
      put('hub', hubRef.current);
      put('net', netRef.current);
      put('sysinfo', sysRef.current);
      put('manager', mgrRef.current);
      services.forEach(s => put(s.route || s.name, cardRefs.current[s.route || s.name]));
      setMid(m);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [services]);

  const counts = useMemo(() => {
    const c: Record<keyof typeof ST_COLOR, number> = { online: 0, offline: 0, maint: 0, off: 0, unknown: 0 };
    services.forEach(s => {
      c[statusOf(s, probes)]++;
    });
    return c;
  }, [services, probes]);

  const hub = mid.hub;
  const edges = useMemo(() => {
    if (!hub) return [];
    const out: { a: { x: number; y: number }; b: { x: number; y: number }; color: string; dashed?: boolean; title?: string }[] = [];
    if (mid.net) out.push({ a: mid.net, b: hub, color: '#38bdf8', title: 'acesso externo HTTPS via Tailscale Funnel' });
    if (mid.sysinfo)
      out.push({ a: mid.sysinfo, b: hub, color: '#565666', dashed: true, title: 'sysinfo:8890 · telemetria (bateria/CPU/armazenamento)' });
    if (mid.manager)
      out.push({ a: mid.manager, b: hub, color: '#565666', dashed: true, title: 'manager:8891 · configura e recarrega o Caddy' });
    services.forEach(s => {
      const p = mid[s.route || s.name];
      if (!p) return;
      const st = statusOf(s, probes);
      const broken = st === 'off' || st === 'maint';
      out.push({
        a: p,
        b: hub,
        color: ST_COLOR[st],
        dashed: broken,
        title: `${s.name} · localhost:${s.port} → rota ${s.route}`,
      });
    });
    return out;
  }, [hub, mid, services, probes]);

  return (
    <>
      <p className="eco-sub">
        {counts.online} online · {counts.offline} offline · {counts.maint} em manutenção · {counts.off} desativado · latência medida a cada {eco ? 90 : 30}s
      </p>
      <div className="eco-wrap" ref={wrapRef}>
        {hub && size.w > 0 ? (
          <svg className="eco-lines" width={size.w} height={size.h}>
            <circle cx={hub.x} cy={hub.y} r={44} fill="none" stroke="rgba(56,189,248,.15)" strokeWidth={1.5} strokeDasharray="3 6" />
            <circle cx={hub.x} cy={hub.y} r={30} fill="rgba(56,189,248,.05)" stroke="rgba(56,189,248,.25)" strokeWidth={1} />
            {edges.map((l, i) => (
              <line
                key={i}
                x1={l.a.x}
                y1={l.a.y}
                x2={l.b.x}
                y2={l.b.y}
                stroke={l.color}
                strokeWidth={2}
                strokeDasharray={l.dashed ? '6 6' : undefined}
                strokeLinecap="round"
                opacity={0.95}
              >
                <title>{l.title}</title>
              </line>
            ))}
          </svg>
        ) : null}

        <div className="eco-top">
          <div className="eco-node infra" ref={sysRef} title="sysinfo:8890 · alimenta o dashboard (bateria/CPU/armazenamento)">
            <span className="eco-node-k">sysinfo</span>
            <span className="eco-node-sub">:8890 · telemetria</span>
          </div>
          <div className="eco-node net" ref={netRef} title="acesso externo HTTPS · server.tail380a9e.ts.net">
            <span className="eco-node-k">🌐 Internet</span>
            <span className="eco-node-sub">HTTPS · Tailscale Funnel</span>
          </div>
          <div className="eco-node infra" ref={mgrRef} title="manager:8891 · gera o bloco gerenciado e recarrega o Caddy">
            <span className="eco-node-k">manager</span>
            <span className="eco-node-sub">:8891 · configura</span>
          </div>
        </div>

        <div className="eco-hub" ref={hubRef} title="Caddy:8888 · roteia tudo: proxy reverso + estáticos (dist, services.json, logos)">
          <span className="eco-hub-logo">Caddy</span>
          <span className="eco-hub-port">:8888</span>
        </div>

        <div className="eco-services">
          {services.map(s => {
            const st = statusOf(s, probes);
            return (
              <div
                key={s.route || s.name}
                ref={el => {
                  cardRefs.current[s.route || s.name] = el;
                }}
                className={'eco-card ' + st}
                title={`${s.name} · localhost:${s.port} · rota ${s.route}${st === 'online' && probes[s.route]?.ms != null ? ' · ' + probes[s.route]!.ms + ' ms' : ''}`}
              >
                <ServiceIcon logo={s.logo} name={s.name} accentBg={s.accentBg} dim={st !== 'online'} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="eco-legend">
        {(['online', 'offline', 'maint', 'off'] as const).map(k => (
          <span key={k}>
            <i style={{ background: ST_COLOR[k] }} />
            {ST_LABEL[k]}
          </span>
        ))}
        <span style={{ color: '#555', fontStyle: 'normal' }}>linha tracejada = rota interrompida (manutenção ou desativada)</span>
      </div>
    </>
  );
}