import { useEffect, useState } from 'react';
import { useToast, type DashboardConfig } from '@server/ui';

const PALETTE = [
  '#00a4dc', '#22c55e', '#a855f7', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#8b5cf6', '#84cc16', '#f97316',
];

const WIDGET_LABEL: Record<string, string> = {
  battery: 'Bateria',
  cpu: 'CPU',
  storage: 'Armazenamento',
  report: 'Relatório dos serviços',
  dock: 'Dock de serviços',
  todo: 'Widgets de to-do',
};

export function DashboardConfigPanel({
  cfg: initial,
  save,
}: {
  cfg: DashboardConfig | null;
  save: (c: DashboardConfig) => Promise<DashboardConfig | null>;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<DashboardConfig | null>(initial);
  const [saving, setSaving] = useState(false);
  const [newTodoText, setNewTodoText] = useState('');

  useEffect(() => {
    if (initial) setDraft(initial);
  }, [initial]);

  if (!draft) return <div className="empty">carregando configuração…</div>;

  const setShow = (k: string, v: boolean) =>
    setDraft(d => (d ? { ...d, show: { ...d.show, [k]: v } } : d));

  const setTitle = (wid: string, title: string) =>
    setDraft(d =>
      d ? { ...d, widgets: d.widgets.map(w => (w.id === wid ? { ...w, title } : w)) } : d,
    );

  const setWidShow = (wid: string, v: boolean) =>
    setDraft(d =>
      d ? { ...d, widgets: d.widgets.map(w => (w.id === wid ? { ...w, show: v } : w)) } : d,
    );

  const addWidget = () =>
    setDraft(d =>
      d
        ? {
            ...d,
            widgets: [
              ...d.widgets,
              { id: 'todo-' + Date.now().toString(36), type: 'todo', title: 'Tarefas', show: true, items: [] },
            ],
          }
        : d,
    );

  const removeWidget = (wid: string) =>
    setDraft(d => (d ? { ...d, widgets: d.widgets.filter(w => w.id !== wid) } : d));

  const addItem = (wid: string, text: string) =>
    setDraft(d =>
      d
        ? {
            ...d,
            widgets: d.widgets.map(w =>
              w.id === wid
                ? { ...w, items: [...w.items, { id: 'i' + Date.now().toString(36), text, done: false }] }
                : w,
            ),
          }
        : d,
    );

  const toggleItem = (wid: string, itemId: string) =>
    setDraft(d =>
      d
        ? {
            ...d,
            widgets: d.widgets.map(w =>
              w.id === wid
                ? { ...w, items: w.items.map(i => (i.id === itemId ? { ...i, done: !i.done } : i)) }
                : w,
            ),
          }
        : d,
    );

  const removeItem = (wid: string, itemId: string) =>
    setDraft(d =>
      d
        ? {
            ...d,
            widgets: d.widgets.map(w =>
              w.id === wid ? { ...w, items: w.items.filter(i => i.id !== itemId) } : w,
            ),
          }
        : d,
    );

  const persist = async () => {
    setSaving(true);
    const saved = await save(draft);
    setSaving(false);
    if (saved) {
      setDraft(saved);
      toast('Configuração do dashboard salva ✓', true);
    } else {
      toast('Falha ao salvar a configuração', false);
    }
  };

  return (
    <div className="card">
      <div className="cfg-intro">
        <h2>Widgets</h2>
        <p>Escolha quais painéis aparecem na dashboard e configure-os.</p>
      </div>

      <div className="cfg-widgets">
        {Object.entries(WIDGET_LABEL).map(([k, label]) => (
          <label key={k} className="cfg-check">
            <input type="checkbox" checked={!!draft.show[k as keyof DashboardConfig['show']]} onChange={e => setShow(k, e.target.checked)} />
            <span>{label}</span>
          </label>
        ))}
      </div>

      <div className="cfg-intro">
        <h2>Widgets de to-do</h2>
        <p>Adicione widgets de tarefas que aparecem na dashboard.</p>
      </div>

      <div className="cfg-widgets">
        <button className="btn primary" onClick={addWidget}>
          + Adicionar widget de to-do
        </button>
      </div>

      {draft.widgets.map(w => (
        <div key={w.id} className="cfg-todo card-inner">
          <div className="cfg-todo-head">
            <input
              className="cfg-title"
              value={w.title}
              onChange={e => setTitle(w.id, e.target.value)}
              placeholder="Título do widget"
            />
            <label className="cfg-check cfg-inline">
              <input type="checkbox" checked={w.show !== false} onChange={e => setWidShow(w.id, e.target.checked)} />
              <span>mostrar</span>
            </label>
            <button className="btn danger" onClick={() => removeWidget(w.id)}>
              Remover
            </button>
          </div>

          <div className="todo-add">
            <input
              value={newTodoText}
              onChange={e => setNewTodoText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const t = newTodoText.trim();
                  if (t) addItem(w.id, t);
                  setNewTodoText('');
                }
              }}
              placeholder="Nova tarefa…"
            />
            <button
              className="btn primary"
              onClick={() => {
                const t = newTodoText.trim();
                if (!t) return;
                addItem(w.id, t);
                setNewTodoText('');
              }}
            >
              +
            </button>
          </div>

          <ul className="cfg-todo-items">
            {w.items.map(it => (
              <li key={it.id} className={'cfg-todo-item' + (it.done ? ' done' : '')}>
                <input type="checkbox" checked={!!it.done} onChange={() => toggleItem(w.id, it.id)} />
                <span>{it.text}</span>
                <button className="btn ghost" onClick={() => removeItem(w.id, it.id)}>
                  ×
                </button>
              </li>
            ))}
            {!w.items.length ? <li className="cfg-todo-empty">Sem tarefas ainda.</li> : null}
          </ul>
        </div>
      ))}

      <div className="cfg-intro">
        <h2>Aparência</h2>
        <p>Tema e cor de destaque da dashboard.</p>
      </div>

      <div className="theme-row">
        {(['dark', 'light'] as const).map(t => (
          <button
            key={t}
            className={'icon-mode-btn' + (draft.theme === t ? ' active' : '')}
            onClick={() => setDraft(d => (d ? { ...d, theme: t } : d))}
          >
            {t === 'dark' ? 'Escuro' : 'Claro'}
          </button>
        ))}
      </div>

      <div className="accent-row">
        {PALETTE.map(c => (
          <button
            key={c}
            className={'swatch' + (draft.accent === c ? ' selected' : '')}
            style={{ background: c }}
            onClick={() => setDraft(d => (d ? { ...d, accent: c } : d))}
            aria-label={'cor ' + c}
          />
        ))}
      </div>

      <div className="form-actions">
        <button className="btn primary" onClick={persist} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  );
}