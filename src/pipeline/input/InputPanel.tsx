import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import {
  Button,
  Chip,
  Panel,
  ProgressBar,
  Slider,
  Toggle,
  useToast,
} from '../../design/components';
import { useInputStore } from '../../store/inputStore';
import { BackgroundRemovalError, cancelBackgroundRemoval, removeBackground } from './bgRemoval';
import { BG_MODEL_SIZE_LABEL, MAX_IMAGE_BYTES, PROVIDER_IMAGE_SIZE } from './config';
import { MAX_ZOOM, MIN_ZOOM, clampCrop, initialCrop, type CropState } from './crop';
import { CropPreview } from './CropPreview';
import {
  canvasToBlob,
  centerCutout,
  cutoutLooksWrong,
  decodeImage,
  renderCrop,
  resizeSquare,
  type DecodedImage,
} from './imageOps';
import { firstImageFile, validateImageFile } from './validate';
import './InputPanel.css';

/** Resolution used for background removal and the working cutout. */
const WORK_SIZE = 768;

type Phase = 'idle' | 'removing';

export function InputPanel({ active = true }: { active?: boolean }) {
  const toast = useToast();
  const prepared = useInputStore((s) => s.prepared);
  const setPrepared = useInputStore((s) => s.setPrepared);
  const clearPrepared = useInputStore((s) => s.clear);
  const incoming = useInputStore((s) => s.incoming);
  const setIncoming = useInputStore((s) => s.setIncoming);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const [image, setImage] = useState<DecodedImage | null>(null);
  const [fileName, setFileName] = useState('');
  const [crop, setCrop] = useState<CropState>(initialCrop);
  const [cutout, setCutout] = useState<HTMLCanvasElement | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [bgProgress, setBgProgress] = useState<{
    stage: 'download' | 'run';
    progress: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);

  const picker = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const imageRef = useRef<DecodedImage | null>(null);

  useEffect(() => {
    imageRef.current = image;
  }, [image]);

  // Free the bitmap and stop any running job when the panel goes away.
  useEffect(
    () => () => {
      imageRef.current?.bitmap.close();
      abort.current?.abort();
    },
    [],
  );

  const loadFile = useCallback(
    async (file: File) => {
      const problem = validateImageFile(file);
      if (problem) {
        toast.show(problem, 'error');
        return;
      }
      try {
        const decoded = await decodeImage(file);
        imageRef.current?.bitmap.close();
        setImage(decoded);
        setFileName(file.name || 'Pasted picture');
        setCrop(initialCrop());
        setCutout(null);
        setShowOriginal(false);
        clearPrepared();
      } catch (e) {
        toast.show(e instanceof Error ? e.message : 'That picture could not be opened.', 'error');
      }
    },
    [toast, clearPrepared],
  );

  // Paste from the clipboard anywhere on the page, unless the user is typing.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!activeRef.current) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        /^(INPUT|TEXTAREA)$/.test(target.tagName) &&
        (target as HTMLInputElement).type !== 'file'
      ) {
        return;
      }
      const file = firstImageFile(e.clipboardData?.items);
      if (file) {
        e.preventDefault();
        void loadFile(file);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loadFile]);

  // Take a picture handed over from elsewhere, such as one picked from generated pictures.
  useEffect(() => {
    if (!incoming) return;
    const timer = window.setTimeout(() => {
      setIncoming(null);
      void loadFile(incoming);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [incoming, loadFile, setIncoming]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void loadFile(file);
  };

  const reset = () => {
    abort.current?.abort();
    setImage(null);
    setCutout(null);
    setPhase('idle');
    setBgProgress(null);
    imageRef.current?.bitmap.close();
    clearPrepared();
  };

  const runRemoval = async () => {
    if (!image) return;
    const controller = new AbortController();
    abort.current = controller;
    setPhase('removing');
    setBgProgress({ stage: 'download', progress: 0 });
    try {
      const input = await canvasToBlob(renderCrop(image, crop, WORK_SIZE));
      const result = await removeBackground(input, setBgProgress, controller.signal);
      if (cutoutLooksWrong(result)) {
        toast.show(
          'Almost nothing was left after removing the background. Try a clearer picture, or skip this step.',
          'error',
        );
      } else {
        setCutout(centerCutout(result, WORK_SIZE));
        setShowOriginal(false);
        clearPrepared();
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        toast.show('Background removal cancelled.');
      } else {
        toast.show(
          e instanceof BackgroundRemovalError ? e.message : 'Background removal did not work.',
          'error',
        );
      }
    } finally {
      setPhase('idle');
      setBgProgress(null);
    }
  };

  const cancelRemoval = () => {
    abort.current?.abort();
    cancelBackgroundRemoval();
  };

  const confirmImage = async () => {
    if (!image) return;
    setSaving(true);
    try {
      const canvas = cutout
        ? resizeSquare(cutout, PROVIDER_IMAGE_SIZE)
        : renderCrop(image, crop, PROVIDER_IMAGE_SIZE);
      const blob = await canvasToBlob(canvas);
      setPrepared({ blob, size: PROVIDER_IMAGE_SIZE, backgroundRemoved: !!cutout });
      toast.show('Picture ready. Next: make the 3D model.', 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not prepare the picture.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const removing = phase === 'removing';
  const maxMb = MAX_IMAGE_BYTES / (1024 * 1024);

  return (
    <Panel title="Input" accent="pink" className="input">
      {!image ? (
        <div
          className={`drop ${dragging ? 'drop--active' : ''}`}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <p className="drop__title">Drop a picture of something you love</p>
          <p className="muted">or paste one with Ctrl+V. PNG, JPG or WEBP, up to {maxMb} MB.</p>
          <Button onClick={() => picker.current?.click()}>Choose picture</Button>
        </div>
      ) : (
        <div className="input__work">
          <p className="input__file" title={fileName}>
            {fileName}
          </p>

          <div className={`checker ${cutout ? 'checker--on' : ''}`}>
            <CropPreview
              image={image}
              crop={crop}
              onCropChange={setCrop}
              overlay={cutout && !showOriginal ? cutout : null}
              disabled={removing}
              label={
                cutout && !showOriginal ? 'Picture with background removed' : 'Square crop preview'
              }
            />
          </div>

          {cutout ? (
            <div className="input__row">
              <Toggle label="Show original" checked={showOriginal} onChange={setShowOriginal} />
              <Button variant="ghost" onClick={() => setCutout(null)}>
                Undo
              </Button>
            </div>
          ) : (
            <Slider
              label="Zoom"
              value={crop.zoom}
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.05}
              disabled={removing}
              format={(v) => `${v.toFixed(1)}x`}
              onChange={(zoom) =>
                setCrop((c) => clampCrop({ ...c, zoom }, image.width, image.height))
              }
            />
          )}

          {removing && bgProgress && (
            <div className="input__progress" role="status">
              <p>
                {bgProgress.stage === 'download'
                  ? bgProgress.progress > 0
                    ? `Downloading the background remover (${BG_MODEL_SIZE_LABEL}, first time only)…`
                    : 'Starting the background remover…'
                  : 'Removing the background…'}
              </p>
              <ProgressBar
                label="Background removal progress"
                value={
                  bgProgress.stage === 'download' && bgProgress.progress > 0
                    ? bgProgress.progress * 100
                    : undefined
                }
              />
              <Button variant="ghost" onClick={cancelRemoval}>
                Cancel
              </Button>
            </div>
          )}

          {!removing && (
            <div className="input__actions">
              {!cutout && (
                <Button variant="secondary" onClick={() => void runRemoval()}>
                  Remove background
                </Button>
              )}
              <Button onClick={() => void confirmImage()} disabled={saving}>
                {cutout ? 'Use this picture' : 'Skip and use picture'}
              </Button>
              <Button variant="ghost" onClick={reset}>
                Choose another
              </Button>
            </div>
          )}

          {prepared && (
            <div className="input__ready">
              <img src={prepared.url} alt="Prepared picture" width={56} height={56} />
              <div>
                <Chip color="mint">Ready</Chip>
                <p className="muted">
                  {prepared.size} × {prepared.size}px
                  {prepared.backgroundRemoved ? ', background removed' : ''}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <input
        ref={picker}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void loadFile(f);
          e.target.value = '';
        }}
      />

      <aside className="tips" aria-label="Tips">
        <h3>Best results</h3>
        <ul>
          <li>One object</li>
          <li>Plain background</li>
          <li>Full object visible</li>
        </ul>
      </aside>
    </Panel>
  );
}
