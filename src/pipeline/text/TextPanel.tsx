import { useEffect, useId, useRef, useState } from 'react';
import {
  Button,
  Chip,
  ChipButton,
  Panel,
  ProgressBar,
  Toggle,
  useToast,
} from '../../design/components';
import { useInputStore } from '../../store/inputStore';
import { useProviderStore } from '../../store/providerStore';
import { describeProgress, formatElapsed } from '../providers/describe';
import { ProviderError } from '../providers/errors';
import { orderProviders, runWithFallback } from '../providers/fallback';
import type { Progress, ProviderStatus } from '../providers/types';
import { MAX_PROMPT_LENGTH, PROMPT_EXAMPLES, buildPrompt, cleanPrompt } from './prompt';
import { TEXT_PROVIDERS, type TextToImageProvider } from './providers';
import './TextPanel.css';

const PICTURE_COUNT = 4;

const STATUS_COLOR: Record<ProviderStatus, 'mint' | 'yellow' | 'pink' | 'violet'> = {
  online: 'mint',
  busy: 'yellow',
  offline: 'pink',
  unknown: 'violet',
};
const STATUS_LABEL: Record<ProviderStatus, string> = {
  online: 'Online',
  busy: 'Busy',
  offline: 'Offline',
  unknown: 'Checking',
};

interface Picture {
  file: File;
  url: string;
}

interface Props {
  /** Called after a picture is chosen, so the app can move on to cropping it. */
  onUsePicture: () => void;
}

export function TextPanel({ onUsePicture }: Props) {
  const toast = useToast();
  const promptId = useId();
  const token = useProviderStore((s) => s.token);
  const setIncoming = useInputStore((s) => s.setIncoming);

  const [text, setText] = useState('');
  const [styleHints, setStyleHints] = useState(true);
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>({});
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState<TextToImageProvider | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [pictures, setPictures] = useState<Picture[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const picturesRef = useRef<Picture[]>([]);

  useEffect(() => {
    picturesRef.current = pictures;
  }, [pictures]);

  // Check which picture makers are up.
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      TEXT_PROVIDERS.map(
        async (p) => [p.id, await p.healthCheck().catch(() => 'unknown' as const)] as const,
      ),
    ).then((entries) => {
      if (!cancelled) setStatuses(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Free picture URLs and stop any job on unmount.
  useEffect(
    () => () => {
      abort.current?.abort();
      picturesRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    },
    [],
  );

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setElapsed(Date.now() - startedAt), 500);
    return () => window.clearInterval(id);
  }, [running, startedAt]);

  const finalPrompt = buildPrompt(text, { styleHints });
  const canStart = cleanPrompt(text).length > 0 && !running;

  const start = async () => {
    if (!canStart) return;
    const controller = new AbortController();
    abort.current = controller;
    pictures.forEach((p) => URL.revokeObjectURL(p.url));
    setPictures([]);
    setSelected(null);
    setError('');
    setNote('');
    setProgress(null);
    setRunning(true);
    setStartedAt(Date.now());
    setElapsed(0);

    try {
      const { value, provider } = await runWithFallback({
        providers: orderProviders(TEXT_PROVIDERS, statuses),
        signal: controller.signal,
        onStart: setActive,
        onFallback: (failed, err, next) =>
          setNote(`${failed.name} didn't work. ${err.message} Trying ${next.name} instead.`),
        run: (p) =>
          p.generateBatch(
            finalPrompt,
            PICTURE_COUNT,
            { token: token || undefined },
            (file) => setPictures((list) => [...list, { file, url: URL.createObjectURL(file) }]),
            setProgress,
            controller.signal,
          ),
      });
      setNote('');
      if (value.error && value.error.kind !== 'cancelled') {
        setNote(
          `${provider.name} made ${value.made} of ${PICTURE_COUNT} pictures. ${value.error.message}`,
        );
      }
    } catch (e) {
      if (e instanceof ProviderError && e.kind === 'cancelled') {
        setNote('');
      } else {
        setError(e instanceof ProviderError ? e.message : 'Something went wrong. Try again.');
      }
    } finally {
      setRunning(false);
      setActive(null);
    }
  };

  const usePicture = () => {
    if (selected === null) return;
    const picture = pictures[selected];
    if (!picture) return;
    setIncoming(picture.file);
    toast.show('Picture sent to the photo step. Crop it, then make the 3D model.', 'success');
    onUsePicture();
  };

  return (
    <Panel title="From text" accent="pink" className="textpanel">
      <div className="textpanel__field">
        <label htmlFor={promptId}>Describe what you want</label>
        <textarea
          id={promptId}
          value={text}
          rows={3}
          maxLength={MAX_PROMPT_LENGTH}
          placeholder="a cute orange cat"
          onChange={(e) => setText(e.target.value)}
        />
        <div className="textpanel__count" aria-hidden="true">
          {text.length}/{MAX_PROMPT_LENGTH}
        </div>
      </div>

      <div className="textpanel__examples" role="group" aria-label="Examples">
        {PROMPT_EXAMPLES.map((ex) => (
          <ChipButton key={ex} color="sky" onClick={() => setText(ex)}>
            {ex}
          </ChipButton>
        ))}
      </div>

      <Toggle label="Add toy-style hints" checked={styleHints} onChange={setStyleHints} />
      {finalPrompt && (
        <p className="muted textpanel__sent">
          <strong>Sent as:</strong> {finalPrompt}
        </p>
      )}
      <p className="muted">English works best, and one clear object gives the best 3D model.</p>

      <ul className="textpanel__makers" aria-label="Picture makers">
        {TEXT_PROVIDERS.map((p) => {
          const s = statuses[p.id] ?? 'unknown';
          return (
            <li key={p.id}>
              <span>
                <strong>{p.name}</strong> <span className="muted">{p.license}</span>
              </span>
              <Chip color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Chip>
            </li>
          );
        })}
      </ul>

      {running ? (
        <div className="textpanel__progress" role="status">
          <p>
            {describeProgress(active?.name ?? 'the server', progress).replace('model', 'pictures')}{' '}
            ({pictures.length} of {PICTURE_COUNT} ready)
          </p>
          <ProgressBar label="Making pictures" />
          <p className="textpanel__time">Elapsed {formatElapsed(elapsed)}</p>
          <Button variant="ghost" onClick={() => abort.current?.abort()}>
            Stop
          </Button>
        </div>
      ) : (
        <Button onClick={() => void start()} disabled={!canStart}>
          Make {PICTURE_COUNT} pictures
        </Button>
      )}

      {note && <p className="textpanel__note">{note}</p>}
      {error && (
        <p className="textpanel__error" role="alert">
          {error}
          {error.includes('quota') &&
            !token &&
            ' A free Hugging Face token (see the Generate step) gives you more GPU time.'}
        </p>
      )}

      {(pictures.length > 0 || running) && (
        <div className="textpanel__grid" role="radiogroup" aria-label="Generated pictures">
          {Array.from({ length: PICTURE_COUNT }, (_, i) => {
            const pic = pictures[i];
            if (!pic) {
              return running ? (
                <div
                  key={i}
                  className="textpanel__slot textpanel__slot--empty"
                  aria-hidden="true"
                />
              ) : null;
            }
            return (
              <button
                key={pic.url}
                type="button"
                role="radio"
                aria-checked={selected === i}
                aria-label={`Picture ${i + 1}`}
                className={`textpanel__slot ${selected === i ? 'textpanel__slot--on' : ''}`}
                onClick={() => setSelected(i)}
              >
                <img src={pic.url} alt="" />
              </button>
            );
          })}
        </div>
      )}

      {pictures.length > 0 && (
        <div className="textpanel__use">
          <Button variant="secondary" onClick={usePicture} disabled={selected === null}>
            Use this picture
          </Button>
          {selected === null && <span className="muted">Pick the one you like best.</span>}
        </div>
      )}
    </Panel>
  );
}
