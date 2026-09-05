import { useMemo, useState } from 'react';
import { accentForPort, hexRgb, logoUrl, type Service } from '@server/ui';

const ACCENTS = ['auto', '#22c55e', '#00a4dc', '#a855f7', '#f59e0b', '#ef4444', '#06b6d4'];
const ICON_MODES = [
  { id: 'preset', label: 'Preset' },
  { id: 'upload', label: 'Enviar arquivo' },
  { id: 'url', label: 'URL' },
  { id: 'codigo', label: 'Código SVG' },
];

interface FormState {
  name: string;
  port: string;
  route: string;
  process: string;
  desc: string;
  maintenance: boolean;
  accent: string;
  iconMode: string;
  iconPreset: string;
  iconUrl: string;
  iconCode: string;
  iconFile: File | null;
  currentLogo: string;
}

function init(editing: Service | null): FormState {
  if (!editing) {
    return {
      name: '',
      port: '',
      route: '',
      process: '',
      desc: '',
      maintenance: false,
      accent: 'auto',
      iconMode: 'preset',
      iconPreset: 'servico.svg',
      iconUrl: '',
      iconCode: '',
      iconFile: null,
      currentLogo: '',
    };
  }
  return {
    name: editing.name || '',
    route: editing.route || '',
    port: String(editing.port ?? ''),
    desc: editing.desc || '',
    process: editing.process || '',
    maintenance: !!editing.maintenance,
    accent: editing.accent || 'auto',
    iconMode: editing.logo?.startsWith('logos/presets/') ? 'preset' : 'atual',
    iconPreset: editing.logo?.startsWith('logos/presets/') ? editing.logo!.split('/').pop()! : 'servico.svg',
    iconUrl: '',
    iconCode: '',
    iconFile: null,
    currentLogo: editing.logo || '',
  };
}

export function ServiceForm({
  presets,
  editing,
  saving,
  serverErr,
  onSubmit,
  onCancel,
}: {
  presets: string[];
  editing: Service | null;
  saving: boolean;
  serverErr: string;
  onSubmit: (fd: FormData, editing: Service | null) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => init(editing));
  const [clientErr, setClientErr] = useState('');
  const setF = (patch: Partial<FormState>) => setForm(f => ({ ...f, ...patch }));
  const legacyEdit = editing?.managed === false;

  const preview = useMemo(() => {
    let src: string | null = null;
    let label = '';
    if (form.iconMode === 'atual') {
      src = form.currentLogo ? logoUrl(form.currentLogo) : null;
      label = form.currentLogo;
    } else if (form.iconMode === 'preset') {
      src = logoUrl('logos/presets/' + form.iconPreset);
      label = form.iconPreset;
    } else if (form.iconMode === 'url') {
      const u = form.iconUrl.trim();
      label = u;
      if (/^https?:\/\//i.test(u)) src = u;
    } else if (form.iconMode === 'codigo' && form.iconCode.trim()) {
      try {
        src = URL.createObjectURL(new Blob([form.iconCode], { type: 'image/svg+xml' }));
        label = 'svg inline';
      } catch {
        src = null;
      }
    } else if (form.iconMode === 'upload' && form.iconFile) {
      src = URL.createObjectURL(form.iconFile);
      label = form.iconFile.name;
    }
    return { src, label };
  }, [form.iconMode, form.iconPreset, form.iconUrl, form.iconCode, form.iconFile, form.currentLogo]);

  const previewBg =
    form.accent === 'auto'
      ? 'rgba(' + hexRgb(accentForPort(parseInt(form.port) || 0)).join(',') + ',.1)'
      : 'rgba(' + hexRgb(form.accent).join(',') + ',.15)';

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (form.iconMode === 'upload' && !form.iconFile) {
      setClientErr('Selecione um arquivo de ícone.');
      return;
    }
    const fd = new FormData();
    fd.set('name', form.name);
    fd.set('route', form.route);
    fd.set('port', form.port);
    fd.set('process', form.process);
    fd.set('desc', form.desc);
    fd.set('maintenance', form.maintenance ? 'on' : '');
    fd.set('icon_mode', form.iconMode);
    if (form.iconMode === 'preset') fd.set('icon_preset', form.iconPreset);
    if (form.iconMode === 'url') fd.set('icon_url', form.iconUrl.trim());
    if (form.iconMode === 'codigo') fd.set('icon_code', form.iconCode);
    if (form.iconMode === 'upload' && form.iconFile) fd.set('icon_file', form.iconFile);
    setClientErr('');
    onSubmit(fd, editing);
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>{editing ? 'Editar · ' + editing.name : 'Novo serviço'}</h2>
      <div className="form-grid">
        <div className="field">
          <label>Nome</label>
          <input value={form.name} onChange={e => setF({ name: e.target.value })} placeholder="ex.: Jellyfin" required />
        </div>
        <div className="field">
          <label>Porta</label>
          <input
            type="number"
            min={1}
            max={65535}
            value={form.port}
            onChange={e => setF({ port: e.target.value })}
            placeholder="ex.: 8096"
            disabled={legacyEdit}
            required
          />
        </div>
        <div className="field">
          <label>Rota</label>
          <input
            value={form.route}
            onChange={e => setF({ route: e.target.value })}
            placeholder="ex.: /jellyfin/"
            disabled={legacyEdit}
            required
          />
          <span className="hint">O Caddy vai criar /rota e /rota/*</span>
        </div>
        <div className="field">
          <label>Processo (para o relatório)</label>
          <input value={form.process} onChange={e => setF({ process: e.target.value })} placeholder="ex.: jellyfin" />
          <span className="hint">opcional · usado pelo sysinfo para monitorar</span>
        </div>
        <div className="field full">
          <label>Descrição</label>
          <input value={form.desc} onChange={e => setF({ desc: e.target.value })} placeholder="ex.: Servidor de mídia" />
        </div>
        <div className="field">
          <label className="field-row" style={{ gap: '.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              style={{ width: 16, height: 16, accentColor: '#f59e0b' }}
              checked={form.maintenance}
              onChange={e => setF({ maintenance: e.target.checked })}
            />
            Em manutenção
          </label>
          <span className="hint">mostra página de manutenção no lugar do serviço</span>
        </div>
      </div>

      <div className="icon-modes">
        {ICON_MODES.map(m => (
          <button
            type="button"
            key={m.id}
            className={'icon-mode-btn' + (form.iconMode === m.id ? ' active' : '')}
            onClick={() => setF({ iconMode: m.id })}
          >
            {m.label}
          </button>
        ))}
        {form.iconMode === 'atual' ? (
          <button type="button" className="icon-mode-btn active">
            Ícone atual
          </button>
        ) : null}
      </div>

      <div className={'icon-pane' + (form.iconMode === 'preset' ? ' show' : '')}>
        <div className="preset-grid">
          {presets.map(p => (
            <div
              key={p}
              className={'preset-item' + (form.iconPreset === p ? ' selected' : '')}
              title={p}
              onClick={() => setF({ iconPreset: p })}
            >
              <img src={logoUrl('logos/presets/' + p)} alt={p} />
            </div>
          ))}
        </div>
      </div>

      <div className={'icon-pane' + (form.iconMode === 'upload' ? ' show' : '')}>
        <input
          type="file"
          accept=".svg,.png,.jpg,.jpeg,.webp,.gif,.avif"
          onChange={e => setF({ iconFile: e.target.files?.[0] ?? null })}
        />
        <span className="hint" style={{ display: 'block', marginTop: '.4rem' }}>
          SVG é o ideal; PNG/JPG/WebP/GIF também funcionam — o dock padroniza todos em 44 px.
        </span>
      </div>

      <div className={'icon-pane' + (form.iconMode === 'url' ? ' show' : '')}>
        <input value={form.iconUrl} onChange={e => setF({ iconUrl: e.target.value })} placeholder="https://example.com/icone.svg" />
      </div>

      <div className={'icon-pane' + (form.iconMode === 'codigo' ? ' show' : '')}>
        <textarea
          rows={4}
          value={form.iconCode}
          onChange={e => setF({ iconCode: e.target.value })}
          placeholder="<svg viewBox=…>…</svg>"
          style={{ width: '100%' }}
        />
      </div>

      <div className="icon-preview">
        <div className="box" style={{ background: previewBg }}>
          {preview.src ? <img src={preview.src} alt="ícone" /> : null}
        </div>
        <div className="meta">
          <b>{preview.label || 'sem ícone'}</b>
          <br />
          pré-visualizado em 64 px · exibido em 44 px no dock
        </div>
      </div>
      {clientErr || serverErr ? <div className="preview-errors">{clientErr || serverErr}</div> : null}

      <div className="accent-row">
        <span style={{ fontSize: '.75rem', color: '#888' }}>Cor de destaque:</span>
        {ACCENTS.map(c => (
          <button
            type="button"
            key={c}
            className={'swatch' + (c === 'auto' ? ' auto' : '') + (form.accent === c ? ' selected' : '')}
            style={c === 'auto' ? undefined : { background: c }}
            title={c === 'auto' ? 'automático' : c}
            onClick={() => setF({ accent: c })}
          />
        ))}
      </div>

      <div className="form-actions">
        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Adicionar serviço'}
        </button>
        <button className="btn ghost" type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}