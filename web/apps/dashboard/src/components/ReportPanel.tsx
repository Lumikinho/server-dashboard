import { fmtMem, type Report, type ReportService } from '@server/ui';
import { Panel } from './Panel';

export function ReportPanel({ report, onRefresh }: { report: Report | null; onRefresh: () => void }) {
  const b = (report || {}).battery || {};
  const dt = report?.ts ? new Date(report.ts * 1000).toLocaleString('pt-BR') : '—';
  const batt = b.pct != null ? ` · bateria ${b.pct}%${b.charging ? ' ⚡' : ''}` : '';
  const sub = report
    ? `${report.host} · ${dt}${batt} · RAM total ${fmtMem(report.total_mb)} · livre ${fmtMem(report.avail_mb)}`
    : '—';

  const discovered = (report?.services || []).filter(s => s.discovered).length;

  function exportJson() {
    if (!report) {
      onRefresh();
      return;
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio-servicos-${report.ts}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  }

  return (
    <div className="report-wrap">
      <Panel title="Relatório dos serviços">
        <div className="report-head" style={{ marginBottom: 0 }}>
          <div className="report-actions">
            <button className="btn" onClick={onRefresh}>
              Atualizar
            </button>
            <button className="btn primary" onClick={exportJson}>
              Exportar JSON
            </button>
          </div>
        </div>
        <div className="report-sub">
          {sub}
          {discovered ? ` · ${discovered} descoberto(s) automático(s)` : ''}
        </div>
        <div className="table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Status</th>
                <th>CPU</th>
                <th>Memória</th>
                <th>Rota</th>
              </tr>
            </thead>
            <tbody>
              {(report?.services || []).map(s => (
                <ReportRow key={s.name + (s.route || '') + (s.port ?? '')} s={s} />
              ))}
              {!report?.services?.length ? (
                <tr>
                  <td colSpan={5} style={{ color: '#555' }}>
                    carregando…
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

export function ReportRow({ s }: { s: ReportService }) {
  const status = s.running ? (
    s.http_ok ? (
      <span className="pill on">
        <span className="dot" />
        online
      </span>
    ) : (
      <span className="pill on">
        <span className="dot" />
        rodando*
      </span>
    )
  ) : (
    <span className="pill off">
      <span className="dot" />
      offline
    </span>
  );
  const cpu = s.cpu_pct != null ? s.cpu_pct + '%' : '—';
  const mem = s.running ? `${fmtMem(s.mem_mb)}${s.mem_pct != null ? ' · ' + s.mem_pct + '%' : ''}` : '—';

  return (
    <tr>
      <td>
        <b style={{ color: '#fff' }}>{s.name}</b>
        {s.infra ? (
          <span style={{ fontSize: '0.65rem', color: '#555' }}> infra</span>
        ) : null}
        {s.discovered ? (
          <span style={{ fontSize: '0.65rem', color: '#555' }}> descoberto</span>
        ) : null}
        {s.running ? (
          <div style={{ fontSize: '0.7rem', color: '#555' }}>
            {s.procs} proc · pid {s.pids?.join(', ') || ''}
          </div>
        ) : null}
      </td>
      <td>{status}</td>
      <td className="mono">
        {cpu}
        <div className="mini-bar">
          <div style={{ width: `${Math.min(100, s.cpu_pct || 0)}%` }} />
        </div>
      </td>
      <td className="mono">{mem}</td>
      <td className="mono" style={{ color: '#666' }}>
        {s.route || `localhost:${s.port ?? ''}`}
      </td>
    </tr>
  );
}