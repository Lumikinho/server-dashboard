import { fmtUptime } from '@server/ui';

export function Header({
  eco,
  automatic,
  onToggle,
  uptime,
}: {
  eco: boolean;
  automatic: boolean;
  onToggle: () => void;
  uptime?: number | null;
}) {
  return (
    <div className="header">
      <h1>Server</h1>
      <p>{window.location.host}</p>
      <div className="status-bar">
        <div className="status-item">
          <div className="status-dot" />
          <span>Online</span>
        </div>
        <div className="status-item">{fmtUptime(uptime)}</div>
        <div
          className={'status-item eco-btn' + (eco ? ' active' : '')}
          role="button"
          tabIndex={0}
          aria-pressed={eco}
          onClick={onToggle}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggle();
            }
          }}
          title={
            automatic
              ? 'Bateria/economia do dispositivo ativa — toque para forçar desligar'
              : 'Automático — toque para forçar ligar/desligar'
          }
        >
          <span>⚡</span>
          <span>{eco ? (automatic ? 'Economia automática' : 'Economia ativa') : 'Economia'}</span>
        </div>
      </div>
    </div>
  );
}