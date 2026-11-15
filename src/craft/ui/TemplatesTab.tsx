import { useEffect, useState } from 'react';
import { Button } from '../../design/components';
import { useCraftStore } from '../store';
import { TEMPLATES, buildTemplateSpec, getTemplate } from '../templates';
import { renderThumbnail } from '../thumbnail';
import { ParamControls } from './fields';

/** Draw each template's picture one at a time so the tab opens instantly. */
function useThumbnails(): Record<string, string> {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    let i = 0;
    const next = () => {
      if (cancelled || i >= TEMPLATES.length) return;
      const t = TEMPLATES[i++];
      try {
        const url = renderThumbnail(t.id, buildTemplateSpec(t, {}));
        if (!cancelled) setThumbs((prev) => ({ ...prev, [t.id]: url }));
      } catch {
        /* a missing picture is not worth an error */
      }
      window.setTimeout(next, 0);
    };
    const timer = window.setTimeout(next, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);
  return thumbs;
}

export function TemplatesTab() {
  const templateId = useCraftStore((s) => s.templateId);
  const params = useCraftStore((s) => s.templateParams);
  const loadTemplate = useCraftStore((s) => s.loadTemplate);
  const setParams = useCraftStore((s) => s.setTemplateParams);
  const hasModel = useCraftStore((s) => s.spec !== null);
  const source = useCraftStore((s) => s.source);
  const thumbs = useThumbnails();
  const active = templateId ? getTemplate(templateId) : undefined;

  return (
    <div className="craft-section">
      <p className="muted">
        Pick a model to start from. These work offline and are already rigged.
      </p>
      <div className="templates" role="radiogroup" aria-label="Templates">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={templateId === t.id}
            className={`template ${templateId === t.id ? 'template--on' : ''}`}
            onClick={() => loadTemplate(t.id)}
          >
            {thumbs[t.id] ? (
              <img src={thumbs[t.id]} alt="" width={72} height={72} />
            ) : (
              <span className="template__blank" />
            )}
            <span>{t.name}</span>
          </button>
        ))}
      </div>

      {active ? (
        <section aria-label={`${active.name} settings`}>
          <h3>{active.name} settings</h3>
          <ParamControls defs={active.params} values={params} onChange={setParams} />
          <Button variant="ghost" onClick={() => loadTemplate(active.id)}>
            Reset to defaults
          </Button>
        </section>
      ) : (
        hasModel && (
          <p className="muted">
            {source === 'edited'
              ? 'You edited this model by hand, so the template sliders are off. Pick a template to start over.'
              : 'This model did not come from a template.'}
          </p>
        )
      )}
    </div>
  );
}
