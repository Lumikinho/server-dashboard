import { useState } from 'react';
import { apiFetch, useToast, type ServicesResponse } from '@server/ui';
import { useCheck, useConfig, usePresets, useServices } from './hooks';
import { ServiceForm } from './components/ServiceForm';
import { ServicesList } from './components/ServicesList';
import { DashboardConfigPanel } from './components/DashboardConfigPanel';

export function App() {
  const toast = useToast();
  const { services, load: reloadServices } = useServices();
  const { cfg, save: saveConfig } = useConfig();
  const presets = usePresets();
  const status = useCheck();
  const [tab, setTab] = useState<'servicos' | 'dashboard'>('servicos');
  const [showForm, setShowForm] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [serverErr, setServerErr] = useState('');

  function openNew() {
    setEditingIdx(null);
    setServerErr('');
    setShowForm(true);
  }

  function openEdit(i: number) {
    setEditingIdx(i);
    setServerErr('');
    setShowForm(true);
  }

  async function submit(fd: FormData, _editing: unknown) {
    setSaving(true);
    setServerErr('');
    try {
      const idx = editingIdx;
      if (idx != null) fd.set('editing', String(idx));
      const url = idx == null ? '/api/services' : '/api/services/' + idx;
      const d = await apiFetch<ServicesResponse & { ok?: boolean; message?: string }>(url, {
        method: idx == null ? 'POST' : 'PUT',
        body: fd,
      });
      setShowForm(false);
      setEditingIdx(null);
      await reloadServices();
      toast(d.message || 'Salvo ✓', d.ok !== false);
    } catch (e) {
      setServerErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(i: number) {
    const target = services[i].enabled === false;
    try {
      const d = await apiFetch<ServicesResponse & { ok?: boolean; message?: string }>('/api/services/' + i, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: target }),
      });
      await reloadServices();
      toast(d.message || '', d.ok !== false);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), false);
    }
  }

  async function remove(i: number) {
    const s = services[i];
    if (s.managed === false) {
      toast('Este serviço foi configurado manualmente no Caddyfile. Remova o bloco dele do Caddyfile e depois apague aqui.', false);
      return;
    }
    if (!confirm('Remover "' + s.name + '" (rota ' + s.route + ')?')) return;
    try {
      const d = await apiFetch<ServicesResponse & { message?: string }>('/api/services/' + i, { method: 'DELETE' });
      await reloadServices();
      toast(d.message || 'Removido');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), false);
    }
  }

  async function reloadCaddy() {
    try {
      const d = await apiFetch<{ ok?: boolean; message?: string }>('/api/reload', { method: 'POST' });
      toast(d.message || '', d.ok !== false);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), false);
    }
  }

  const editing = editingIdx != null && services[editingIdx] ? services[editingIdx] : null;

  return (
    <div className="manager-page">
      <div className="container">
        <div className="header">
          <h1>
            Configurações do Dashboard
            <small>acesso local · 127.0.0.1:8891 · não exposto pelo Caddy</small>
          </h1>
        </div>

        <div className="tabs">
          <button className={'tab' + (tab === 'servicos' ? ' active' : '')} onClick={() => setTab('servicos')}>
            Serviços
          </button>
          <button className={'tab' + (tab === 'dashboard' ? ' active' : '')} onClick={() => setTab('dashboard')}>
            Dashboard
          </button>
        </div>

        {tab === 'servicos' ? (
          <>
            <div className="header-row">
              <div className="header-actions">
                <button className="btn" onClick={reloadCaddy}>
                  Recarregar Caddy
                </button>
                <button className="btn primary" onClick={openNew}>
                  + Novo serviço
                </button>
              </div>
            </div>

            {showForm ? (
              <ServiceForm
                presets={presets}
                editing={editing}
                saving={saving}
                serverErr={serverErr}
                onSubmit={submit}
                onCancel={() => {
                  setShowForm(false);
                  setEditingIdx(null);
                }}
              />
            ) : null}

            <ServicesList
              services={services}
              status={status}
              onToggle={toggleEnabled}
              onEdit={openEdit}
              onRemove={remove}
            />
          </>
        ) : (
          <DashboardConfigPanel cfg={cfg} save={saveConfig} />
        )}
      </div>

      <div className="footer">Caddy Manager · roda apenas em 127.0.0.1 — não tem rota no Caddyfile</div>
    </div>
  );
}