import { useState } from 'react';
import type { TodoWidget } from '@server/ui';
import { Panel } from './Panel';

export function TodoPanel({
  widget,
  onAdd,
  onToggle,
  onDelete,
}: {
  widget: TodoWidget;
  onAdd: (text: string) => void;
  onToggle: (itemId: string) => void;
  onDelete: (itemId: string) => void;
}) {
  const [text, setText] = useState('');

  const add = () => {
    const t = text.trim();
    if (!t) return;
    onAdd(t);
    setText('');
  };

  return (
    <div className="report-wrap">
      <Panel title={widget.title}>
        <div className="todo-add">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') add();
            }}
            placeholder="Nova tarefa…"
          />
          <button className="btn primary" onClick={add}>
            +
          </button>
        </div>
        <ul className="todo-list">
          {widget.items.map(it => (
            <li key={it.id} className={'todo-item' + (it.done ? ' done' : '')}>
              <input
                type="checkbox"
                checked={!!it.done}
                onChange={() => onToggle(it.id)}
                aria-label="concluir"
              />
              <span className="todo-text">{it.text}</span>
              <button className="btn ghost todo-del" onClick={() => onDelete(it.id)} aria-label="remover">
                ×
              </button>
            </li>
          ))}
          {!widget.items.length ? (
            <li className="todo-empty">Nenhuma tarefa ainda.</li>
          ) : null}
        </ul>
      </Panel>
    </div>
  );
}