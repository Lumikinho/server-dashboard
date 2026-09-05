import { useEffect } from 'react';
import { useEco } from '@server/ui';
import { useReport, useServices, useSystemStatus } from './hooks';
import { BatteryPanel } from './components/BatteryPanel';
import { CpuPanel } from './components/CpuPanel';
import { StoragePanel } from './components/StoragePanel';
import { ReportPanel } from './components/ReportPanel';
import { Ecosystem } from './components/Ecosystem';
import { Dock } from './components/Dock';
import { Header } from './components/Header';

export function App() {
  const { eco, automatic, toggle } = useEco();
  const services = useServices();
  const sys = useSystemStatus(eco);
  const { report, refresh } = useReport(eco);

  useEffect(() => {
    document.body.classList.toggle('eco', eco);
  }, [eco]);

  return (
    <div className="page">
      <Header eco={eco} automatic={automatic} onToggle={toggle} uptime={sys?.uptime_s} />

      <div className="grid">
        <BatteryPanel b={sys?.battery} history={sys?.history} />
        <CpuPanel c={sys?.cpu} />
        <StoragePanel disks={sys?.storage} />
      </div>

      <Ecosystem services={services} eco={eco} />

      <ReportPanel report={report} onRefresh={refresh} />

      <Dock services={services} eco={eco} />

      <div className="footer-dash">Tailscale Network</div>
    </div>
  );
}