import { useEffect, useRef, useState } from 'react';
import { Button, Chip, Panel, ProgressBar, useToast } from '../../design/components';
import { useInputStore } from '../../store/inputStore';
import { useModelStore } from '../../store/modelStore';
import { useProviderStore } from '../../store/providerStore';
import { describeProgress, formatElapsed } from './describe';
import { PROVIDERS, ProviderError, generateWithFallback, orderProviders } from './index';
import type { ImageTo3DProvider, Progress, ProviderStatus } from './index';
import './GeneratePanel.css';

const STATUS_LABEL: Record<ProviderStatus, string> = {
  online: 'Online',
  busy: 'Busy',
  offline: 'Offline',
  unknown: 'Checking',
};
const STATUS_COLOR: Record<ProviderStatus, 'mint' | 'yellow' | 'pink' | 'violet'> = {
  online: 'mint',
  busy: 'yellow',
  offline: 'pink',
  unknown: 'violet',
};

interface Props {
  onGoToInput: () => void;
}

export function GeneratePanel({ onGoToInput }: Props) {
  const toast = useToast();
  const prepared = useInputStore((s) => s.prepared);
  const statuses = useProviderStore((s) => s.statuses);
  const checking = useProviderStore((s) => s.checking);
  const checkAll = useProviderStore((s) => s.checkAll);
  const token = useProviderStore((s) => s.token);
  const setToken = useProviderStore((s) => s.setToken);
  const showModel = useModelStore((s) => s.show);

  const [running, setRunning] = useState(false);
  const [active, setActive] = useState<ImageTo3DProvider | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [errorIsQuota, setErrorIsQuota] = useState(false);
  const [tokenDraft, setTokenDraft] = useState(token);
  const abort = useRef<AbortController | null>(null);

  // Check provider health when the panel opens.
  useEffect(() => {
    void checkAll();
  }, [checkAll]);

  useEffect(() => () => abort.current?.abort(), []);

  // Elapsed-time ticker while a job runs.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setElapsed(Date.now() - startedAt), 500);
    return () => window.clearInterval(id);
  }, [running, startedAt]);

  const start = async () => {
    if (!prepared || running) return;
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);
    setError('');
    setErrorIsQuota(false);
    setNote('');
    setProgress(null);
    setStartedAt(Date.now());
    setElapsed(0);

    const ordered = orderProviders(PROVIDERS, statuses);
    try {
      const { glb, provider } = await generateWithFallback({
        providers: ordered,
        image: prepared.blob,
        opts: { token: token || undefined, backgroundRemoved: prepared.backgroundRemoved },
        signal: controller.signal,
        callbacks: {
          onStart: (p) => {
            setActive(p);
            setProgress(null);
          },
          onProgress: (_p, pr) => setProgress(pr),
          onFallback: (failed, err, next) =>
            setNote(`${failed.name} didn't work. ${err.message} Trying ${next.name} instead.`),
        },
      });
      showModel(glb, `${provider.name} model.glb`, true);
      toast.show(`Your model is ready, made by ${provider.name}.`, 'success');
      setNote('');
    } catch (e) {
      if (e instanceof ProviderError && e.kind === 'cancelled') {
        setNote('');
        toast.show('Cancelled.');
      } else {
        setError(e instanceof ProviderError ? e.message : 'Something went wrong. Try again.');
        setErrorIsQuota(e instanceof ProviderError && e.kind === 'quota');
      }
    } finally {
      setRunning(false);
      setActive(null);
      void checkAll();
    }
  };

  const tokenChanged = tokenDraft.trim() !== token;
  const tokenInvalid = tokenDraft.trim() !== '' && !tokenDraft.trim().startsWith('hf_');

  return (
    <Panel title="Generate" accent="orange" className="generate">
      {!prepared ? (
        <div className="generate__need">
          <p>Add a picture first, then come back to make the 3D model.</p>
          <Button variant="secondary" onClick={onGoToInput}>
            Go to Input
          </Button>
        </div>
      ) : (
        <div className="generate__ready">
          <img src={prepared.url} alt="Picture to turn into 3D" width={72} height={72} />
          <p>This picture will become your 3D model.</p>
        </div>
      )}

      <section aria-label="Servers">
        <div className="generate__head">
          <h3>Free servers</h3>
          <Button variant="ghost" onClick={() => void checkAll()} disabled={checking || running}>
            {checking ? 'Checking…' : 'Recheck'}
          </Button>
        </div>
        <ul className="providers">
          {PROVIDERS.map((p) => {
            const s = statuses[p.id] ?? 'unknown';
            return (
              <li key={p.id} className="provider">
                <div className="provider__top">
                  <strong>{p.name}</strong>
                  <Chip color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Chip>
                </div>
                <p className="provider__meta">
                  {p.typicalWait}. {p.license}.
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      {running ? (
        <div className="generate__progress" role="status">
          <p>{describeProgress(active?.name ?? 'the server', progress)}</p>
          <ProgressBar label="Generating your model" />
          <p className="generate__time">Elapsed {formatElapsed(elapsed)}</p>
          {note && <p className="generate__note">{note}</p>}
          <Button variant="ghost" onClick={() => abort.current?.abort()}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="generate__actions">
          <Button onClick={() => void start()} disabled={!prepared}>
            Make 3D model
          </Button>
          <p className="muted">
            Free servers can be slow or busy, so this can take a minute or two.
          </p>
        </div>
      )}

      {error && (
        <p className="generate__error" role="alert">
          {error}
          {errorIsQuota &&
            !token &&
            ' A free Hugging Face token (see below) gives you more GPU time.'}
        </p>
      )}
      {!running && note && !error && <p className="generate__note">{note}</p>}

      <details className="token">
        <summary>Hugging Face token (optional)</summary>
        <p className="muted">
          A free Hugging Face account gives you more free GPU time on these servers. Create a token
          at huggingface.co/settings/tokens (read access is enough). It stays in this browser and is
          only sent to Hugging Face.
        </p>
        <label className="token__label" htmlFor="hf-token">
          Token
        </label>
        <input
          id="hf-token"
          className="token__input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="hf_…"
          value={tokenDraft}
          onChange={(e) => setTokenDraft(e.target.value)}
        />
        {tokenInvalid && <p className="generate__error">A Hugging Face token starts with hf_.</p>}
        <div className="token__actions">
          <Button
            variant="secondary"
            disabled={!tokenChanged || tokenInvalid}
            onClick={() => {
              setToken(tokenDraft);
              toast.show(
                tokenDraft.trim() ? 'Token saved in this browser.' : 'Token removed.',
                'success',
              );
            }}
          >
            Save token
          </Button>
          {token && (
            <Button
              variant="ghost"
              onClick={() => {
                setTokenDraft('');
                setToken('');
                toast.show('Token removed.');
              }}
            >
              Remove
            </Button>
          )}
        </div>
      </details>

      <p className="muted">
        The back of a generated model is guessed by the AI, so it may look off.
      </p>
    </Panel>
  );
}
