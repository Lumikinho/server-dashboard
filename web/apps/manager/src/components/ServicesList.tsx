import { Badge, ServiceIcon, StatusDot, type CheckStatus, type Service } from '@server/ui';

export function ServicesList({
  services,
  status,
  onToggle,
  onEdit,
  onRemove,
}: {
  services: Service[];
  status: CheckStatus;
  onToggle: (i: number) => void;
  onEdit: (i: number) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <>
      <div className="services-head">
        <h2>Serviços configurados</h2>
        <span style={{ fontSize: '.72rem', color: '#555' }}>{services.length} serviço(s)</span>
      </div>
      <div className="card">
        {!services.length ? (
          <div className="empty">Nenhum serviço ainda. Clique em "+ Novo serviço".</div>
        ) : (
          services.map((s, i) => (
            <ServiceRow
              key={s.route || s.name}
              s={s}
              running={status[s.route]}
              onToggle={() => onToggle(i)}
              onEdit={() => onEdit(i)}
              onRemove={() => onRemove(i)}
            />
          ))
        )}
      </div>
    </>
  );
}

function ServiceRow({
  s,
  running,
  onToggle,
  onEdit,
  onRemove,
}: {
  s: Service;
  running?: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const maint = !!s.maintenance;
  const off = s.enabled === false;
  const dotCls = off
    ? 'off'
    : maint
      ? 'maint'
      : running === undefined
        ? ''
        : running
          ? 'online'
          : 'offline';

  return (
    <div className="service">
      <ServiceIcon logo={s.logo} name={s.name} accentBg={s.accentBg} dim={maint || off} />
      <div className="svc-info">
        <div className="svc-name">
          {s.name}
          {s.managed === false ? <Badge tone="legado">manual</Badge> : <Badge tone="managed">novo · gerenciado</Badge>}
          {off ? <Badge tone="off">desativado</Badge> : null}
          {maint ? <Badge tone="maint">em manutenção</Badge> : null}
          <StatusDot cls={dotCls} />
        </div>
        <div className="svc-desc">{s.desc || ''}</div>
        <div className="svc-route">
          {off
            ? 'rota desativada — sem proxy'
            : maint
              ? 'em manutenção — página de manutenção em '
              : 'rota '}
          <b>{s.route}</b> → <b>localhost:{s.port}</b>
        </div>
      </div>
      <div className="svc-actions">
        <button className={'btn ' + (off ? 'primary' : 'ghost')} onClick={onToggle}>
          {off ? 'Reativar' : 'Desativar'}
        </button>
        <button className="btn ghost" onClick={onEdit}>
          Editar
        </button>
        <button className="btn danger" onClick={onRemove}>
          Remover
        </button>
      </div>
    </div>
  );
}