import { useEffect } from 'react';
import { useEco } from '@server/ui';
import { useConfig, useReport, useServices, useSystemStatus } from './hooks';
import { BatteryPanel } from './components/BatteryPanel';
import { CpuPanel } from './components/CpuPanel';
import { StoragePanel } from './components/StoragePanel';
import { ReportPanel } from './components/ReportPanel';
import { TodoPanel } from './components/TodoPanel';
import { Dock } from './components/Dock';
import { Header } from './components/Header';

export function App() {
  const { eco, automatic, toggle } = useEco();
  const services = useServices();
  const sys = useSystemStatus(eco);
  const { report, refresh } = useReport(eco);
  const { cfg, update } = useConfig();

  useEffect(() => {
    document.body.classList.toggle('eco', eco);
  }, [eco]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = cfg?.theme || 'dark';
    root.style.setProperty('--accent-blue', cfg?.accent || '#00a4dc');
  }, [cfg]);

  const show = cfg?.show || {
    battery: true,
    cpu: true,
    storage: true,
    report: true,
    dock: true,
    todo: true,
  }; 
  const todoWidgets = (cfg?.widgets || []).filter(w => w.show !== false);

  const toggleItem = (wid: string, itemId: string) => {
    void update(c => ({
      ...c,
      widgets: c.widgets.map(w =>
        w.id === wid
          ? {
              ...w,
              items: w.items.map(i => (i.id === itemId ? { ...i, done: !i.done } : i)),
            }
          : w,
      ),
    }));
  };

  const addItem = (wid: string, text: string) => {
    void update(c => ({
      ...c,
      widgets: c.widgets.map(w =>
        w.id === wid
          ? {
              ...w,
              items: [
                ...w.items,
                { id: 'i' + Date.now().toString(36), text, done: false },
              ],
            }
          : w,
      ),
    }));
  };

  const deleteItem = (wid: string, itemId: string) => {
    void update(c => ({
      ...c,
      widgets: c.widgets.map(w =>
        w.id === wid ? { ...w, items: w.items.filter(i => i.id !== itemId) } : w,
      ),
    }));
  };

  return (
    <div className="page">
      <Header eco={eco} automatic={automatic} onToggle={toggle} uptime={sys?.uptime_s} />

      {show.battery || show.cpu || show.storage ? (
        <div className="grid">
          {show.battery ? <BatteryPanel b={sys?.battery} history={sys?.history} /> : null}
          {show.cpu ? <CpuPanel c={sys?.cpu} /> : null}
          {show.storage ? <StoragePanel disks={sys?.storage} /> : null}
        </div>
      ) : null}

      {show.report ? <ReportPanel report={report} onRefresh={refresh} /> : null}

      {show.todo ? todoWidgets.map(w => <TodoPanel key={w.id} widget={w} onAdd={(t) => addItem(w.id, t)} onToggle={(i) => toggleItem(w.id, i)} onDelete={(i) => deleteItem(w.id, i)} />) : null}

      {show.dock ? <Dock services={services} eco={eco} /> : null}

      <div className="footer-dash">Tailscale Network</div>
    </div>
  );
}