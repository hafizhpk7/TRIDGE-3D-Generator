import { useEffect, useState } from 'react';
import { Button, Chip, Panel, Tabs } from '../../design/components';
import { deletePart } from '../editor/ops';
import { useCraftStore, useCraftUi } from '../store';
import { AskClaudeTab } from './AskClaudeTab';
import { EditTab } from './EditTab';
import { TemplatesTab } from './TemplatesTab';
import './craft.css';

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** The Craft source: templates, Ask Claude, and the part editor. */
export function CraftStep({ active }: { active: boolean }) {
  const spec = useCraftStore((s) => s.spec);
  const building = useCraftStore((s) => s.building);
  const buildError = useCraftStore((s) => s.buildError);
  const built = useCraftStore((s) => s.built);
  const preview = useCraftUi((s) => s.preview);
  const setPreview = useCraftUi((s) => s.setPreview);
  const setEditMode = useCraftUi((s) => s.setEditMode);
  const setGizmoMode = useCraftUi((s) => s.setGizmoMode);
  const [tab, setTab] = useState('templates');

  // Handles and picking only work while the Edit tab is the one you are looking at.
  useEffect(() => {
    setEditMode(active && tab === 'edit');
    return () => setEditMode(false);
  }, [active, tab, setEditMode]);

  // Keyboard shortcuts: undo/redo, and W/E/R to switch the gizmo tool.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const store = useCraftStore.getState();
      if (!store.spec) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if (mod && k === 'y') {
        e.preventDefault();
        store.redo();
      } else if (!mod && tab === 'edit') {
        if (k === 'w') setGizmoMode('translate');
        else if (k === 'e') setGizmoMode('rotate');
        else if (k === 'r') setGizmoMode('scale');
        else if (k === 'escape') store.select(null);
        else if ((k === 'delete' || k === 'backspace') && store.selectedId) {
          e.preventDefault();
          const cur = useCraftStore.getState();
          if (cur.spec && cur.selectedId) {
            cur.edit(deletePart(cur.spec, cur.selectedId));
            cur.select(null);
          }
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, tab, setGizmoMode]);

  return (
    <Panel title="Craft" accent="violet" className="craft">
      <p className="muted">
        Build a toy from simple shapes. It comes already rigged, with no photo or server needed.
      </p>
      {spec && (
        <div className="craft-summary" role="status" aria-live="polite">
          <strong>{spec.name}</strong>
          <Chip color="mint">{spec.parts.length} parts</Chip>
          {built && <Chip color="sky">{built.triangles.toLocaleString('en-US')} triangles</Chip>}
          {building && <Chip color="yellow">Building…</Chip>}
          <Button variant="ghost" aria-pressed={preview} onClick={() => setPreview(!preview)}>
            {preview ? 'Stop preview' : 'Preview movement'}
          </Button>
        </div>
      )}
      {buildError && (
        <p className="craft-error" role="alert">
          {buildError}
        </p>
      )}
      <Tabs
        ariaLabel="Craft tools"
        value={tab}
        onChange={setTab}
        keepMounted
        tabs={[
          { id: 'templates', label: 'Templates', content: <TemplatesTab /> },
          { id: 'claude', label: 'Ask Claude', content: <AskClaudeTab /> },
          { id: 'edit', label: 'Edit', content: <EditTab /> },
        ]}
      />
    </Panel>
  );
}
