import { useMemo, useRef, useState } from 'react';
import type { ClipboardEvent, DragEvent } from 'react';
import { Button, Chip, Toggle, useToast } from '../../design/components';
import { anthropicProvider, AIError } from '../ai/anthropic';
import { createWithAI, refineWithAI, type AIOutcome } from '../ai/provider';
import { useCraftAI } from '../ai/settings';
import { createPrompt, fixPrompt, processAnswer, refinePrompt } from '../prompts';
import { BODY_TYPES, type BodyType } from '../spec/types';
import { useCraftStore } from '../store';
import { SelectField } from './fields';

const CLAUDE_URL = 'https://claude.ai/new';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function AskClaudeTab() {
  const toast = useToast();
  const spec = useCraftStore((s) => s.spec);
  const versions = useCraftStore((s) => s.versions);
  const warnings = useCraftStore((s) => s.warnings);
  const loadSpec = useCraftStore((s) => s.loadSpec);
  const restoreVersion = useCraftStore((s) => s.restoreVersion);

  const ai = useCraftAI();

  const [description, setDescription] = useState('');
  const [bodyType, setBodyType] = useState<BodyType | 'auto'>('auto');
  const [photoName, setPhotoName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [request, setRequest] = useState('');
  const [answer, setAnswer] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [showPrompt, setShowPrompt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  const prompt = useMemo(
    () => createPrompt({ description, hasPhoto: Boolean(photoName), bodyType }),
    [description, photoName, bodyType],
  );

  const copy = async (text: string, what: string) => {
    if (await copyText(text)) toast.show(`${what} copied.`, 'success');
    else {
      setShowPrompt(true);
      toast.show(
        "Couldn't copy automatically. Select the text in the box and copy it yourself.",
        'error',
      );
    }
  };

  const openClaude = () => {
    window.open(CLAUDE_URL, '_blank', 'noopener,noreferrer');
  };

  /** Turn pasted text into a model. */
  const build = (raw: string, label = 'Claude') => {
    const result = processAnswer(raw);
    if (result.ok) {
      setErrors([]);
      setNotes(result.notes);
      loadSpec(result.spec, 'claude', label, result.warnings);
      toast.show(`"${result.spec.name}" is ready.`, 'success');
    } else {
      setErrors(result.errors);
      setNotes([]);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text');
    if (text.trim()) build(text);
  };

  const onDrop = async (e: DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!/\.(json|txt)$/i.test(file.name)) {
      toast.show('Drop a .json file, or paste the text.', 'error');
      return;
    }
    const text = await file.text();
    setAnswer(text);
    build(text, file.name);
  };

  const pickPhoto = (file: File | undefined) => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    if (!file) {
      setPhotoName('');
      setPhotoUrl('');
      return;
    }
    // The photo only stays on this device; it is shown here as a reminder to attach it in Claude.
    setPhotoName(file.name);
    setPhotoUrl(URL.createObjectURL(file));
  };

  // ---- direct API mode
  const apiReady = ai.enabled && ai.apiKey.length > 0;
  const runAI = async (task: (signal: AbortSignal) => Promise<AIOutcome>, label: string) => {
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setApiError('');
    try {
      const out = await task(controller.signal);
      setAnswer(out.raw);
      if (out.result.ok) {
        setErrors([]);
        setNotes(out.fixed ? ['The first answer needed one automatic correction.'] : []);
        loadSpec(out.result.spec, 'claude', label, out.result.warnings);
        toast.show(`"${out.result.spec.name}" is ready.`, 'success');
      } else {
        setErrors(out.result.errors);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setApiError(e instanceof AIError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const provider = () => anthropicProvider({ apiKey: ai.apiKey, model: ai.model });

  const canAsk = description.trim().length > 0;

  return (
    <div className="craft-section">
      <p className="muted">
        This uses your own Claude.ai account in another tab, so it is free on the free plan. TRIDGE
        never sees your login. If you pick a photo, it stays on your device and you attach it in
        Claude yourself.
      </p>

      <div className="field">
        <label htmlFor="craft-description">Describe your model</label>
        <textarea
          id="craft-description"
          rows={3}
          value={description}
          placeholder="a chubby penguin with a red scarf"
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <SelectField
        label="Body type"
        value={bodyType}
        options={[
          { value: 'auto', label: 'Let Claude choose' },
          ...BODY_TYPES.map((b) => ({ value: b, label: b })),
        ]}
        onChange={(v) => setBodyType(v as BodyType | 'auto')}
      />
      <div className="craft-row">
        <Button variant="ghost" onClick={() => photoInput.current?.click()}>
          {photoName ? 'Change photo' : 'Add a photo (optional)'}
        </Button>
        {photoName && (
          <>
            {photoUrl && (
              <img className="craft-photo" src={photoUrl} alt="" width={40} height={40} />
            )}
            <span className="muted">{photoName}</span>
            <Button variant="ghost" onClick={() => pickPhoto(undefined)}>
              Remove
            </Button>
          </>
        )}
        <input
          ref={photoInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            pickPhoto(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      <div className="craft-row">
        <Button onClick={() => void copy(prompt, 'Prompt')} disabled={!canAsk}>
          Copy prompt
        </Button>
        <Button variant="secondary" onClick={openClaude}>
          Open Claude
        </Button>
      </div>
      {photoName && (
        <p className="muted">In Claude, attach the photo to the same message as the prompt.</p>
      )}
      <details
        open={showPrompt}
        onToggle={(e) => setShowPrompt((e.target as HTMLDetailsElement).open)}
      >
        <summary>Show the prompt</summary>
        <textarea
          className="craft-prompt"
          readOnly
          rows={8}
          value={prompt}
          aria-label="The prompt"
        />
      </details>

      <div className="field">
        <label htmlFor="craft-answer">Paste Claude&apos;s answer</label>
        <textarea
          id="craft-answer"
          rows={5}
          value={answer}
          placeholder="The model builds as soon as you paste. You can also drop a .json file here."
          onChange={(e) => setAnswer(e.target.value)}
          onPaste={onPaste}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => void onDrop(e)}
        />
      </div>
      <div className="craft-row">
        <Button variant="secondary" onClick={() => build(answer)} disabled={!answer.trim()}>
          Build from answer
        </Button>
      </div>

      {notes.length > 0 && <p className="muted">{notes.join(' ')}</p>}
      {errors.length > 0 && (
        <div className="craft-error" role="alert">
          <strong>The answer could not be used:</strong>
          <ul>
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <Button
            variant="secondary"
            onClick={() => void copy(fixPrompt(errors, answer), 'Fix prompt')}
          >
            Copy fix prompt
          </Button>
          <p className="muted">
            Paste the fix prompt into the same Claude chat, then paste its new answer above.
          </p>
        </div>
      )}
      {spec && warnings.length > 0 && (
        <details className="craft-warnings">
          <summary>
            {warnings.length} thing{warnings.length === 1 ? ' was' : 's were'} fixed automatically
          </summary>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      {spec && (
        <section aria-label="Refine">
          <h3>Change this model</h3>
          <div className="field">
            <label htmlFor="craft-refine">What should change?</label>
            <input
              id="craft-refine"
              type="text"
              value={request}
              placeholder="make the head bigger"
              onChange={(e) => setRequest(e.target.value)}
            />
          </div>
          <div className="craft-row">
            <Button
              onClick={() => void copy(refinePrompt(request, spec), 'Refine prompt')}
              disabled={!request.trim()}
            >
              Copy refine prompt
            </Button>
            <Button variant="secondary" onClick={openClaude}>
              Open Claude
            </Button>
          </div>
          <p className="muted">
            English or Indonesian both work. Then paste Claude&apos;s answer above.
          </p>
        </section>
      )}

      {versions.length > 1 && (
        <section aria-label="Versions">
          <h3>Versions</h3>
          <ol className="craft-versions">
            {versions.map((v, i) => (
              <li key={v.at + String(i)}>
                <span>
                  {i + 1}. {v.label} <span className="muted">({v.spec.parts.length} parts)</span>
                </span>
                <Button variant="ghost" onClick={() => restoreVersion(i)}>
                  Go back to this
                </Button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <details className="craft-api">
        <summary>Use my own API key (optional)</summary>
        <p className="craft-warn">
          This may cost money on your Anthropic API account. The copy and paste way above is free.
        </p>
        <Toggle label="Use my API key" checked={ai.enabled} onChange={ai.setEnabled} />
        <div className="field">
          <label htmlFor="craft-key">Anthropic API key</label>
          <input
            id="craft-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={ai.apiKey}
            placeholder="sk-ant-…"
            onChange={(e) => ai.setApiKey(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="craft-model">Model name</label>
          <input
            id="craft-model"
            type="text"
            value={ai.model}
            onChange={(e) => ai.setModel(e.target.value)}
          />
        </div>
        <p className="muted">
          The key stays in this browser, is never logged, and is never saved in exported files. It
          is sent only to Anthropic.
        </p>
        <div className="craft-row">
          <Button variant="ghost" onClick={ai.forgetKey} disabled={!ai.apiKey}>
            Forget key
          </Button>
        </div>
        {apiReady && (
          <div className="craft-row">
            <Button
              disabled={busy || !canAsk}
              onClick={() =>
                void runAI(
                  (signal) =>
                    createWithAI(provider(), { description, hasPhoto: false, bodyType }, signal),
                  'Claude (API)',
                )
              }
            >
              Make it with my key
            </Button>
            {spec && (
              <Button
                variant="secondary"
                disabled={busy || !request.trim()}
                onClick={() =>
                  void runAI(
                    (signal) => refineWithAI(provider(), request, spec, signal),
                    'Claude (API, refined)',
                  )
                }
              >
                Refine with my key
              </Button>
            )}
            {busy && (
              <>
                <Chip color="yellow">Working…</Chip>
                <Button variant="ghost" onClick={() => abort.current?.abort()}>
                  Cancel
                </Button>
              </>
            )}
          </div>
        )}
        {apiError && (
          <p className="craft-error" role="alert">
            {apiError}
          </p>
        )}
      </details>
    </div>
  );
}
