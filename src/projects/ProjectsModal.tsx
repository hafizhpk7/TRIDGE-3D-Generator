import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, IconButton, Modal, ProgressBar } from '../design/components';
import { formatBytes } from '../export/download';
import { nearlyFull } from './db';
import { useShell } from '../app/shellStore';
import { useProjectStore } from './store';
import type { ProjectMeta } from './types';
import './ProjectsModal.css';

const when = (t: number) =>
  new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** The picture on a gallery card. The object URL is released when the card goes away. */
function Thumb({ meta }: { meta: ProjectMeta }) {
  const url = useMemo(
    () =>
      meta.thumb
        ? URL.createObjectURL(new Blob([meta.thumb.bytes], { type: meta.thumb.type }))
        : null,
    [meta.thumb],
  );
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  return url ? (
    <img className="project-card__thumb" src={url} alt="" />
  ) : (
    <div className="project-card__thumb project-card__thumb--empty" aria-hidden="true">
      3D
    </div>
  );
}

function Card({ meta, current }: { meta: ProjectMeta; current: boolean }) {
  const s = useProjectStore();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(meta.name);
  const [confirming, setConfirming] = useState(false);

  const finishRename = () => {
    setRenaming(false);
    if (name.trim() && name.trim() !== meta.name) void s.rename(meta.id, name);
    else setName(meta.name);
  };

  return (
    <li className={`project-card ${current ? 'project-card--current' : ''}`}>
      <Thumb meta={meta} />
      <div className="project-card__body">
        {renaming ? (
          <input
            className="project-card__rename"
            aria-label={`New name for ${meta.name}`}
            value={name}
            autoFocus
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            onBlur={finishRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') finishRename();
              if (e.key === 'Escape') {
                setName(meta.name);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <h3 className="project-card__name">
            {meta.name}
            {current && <span className="project-card__badge">open now</span>}
          </h3>
        )}
        <p className="muted">
          {meta.kind === 'craft' ? 'Craft' : 'Model'} · {formatBytes(meta.bytes)} ·{' '}
          {when(meta.updatedAt)}
        </p>
        {confirming ? (
          <div className="project-card__actions" role="group" aria-label={`Delete ${meta.name}?`}>
            <span className="project-card__warn">Delete for good? This cannot be undone.</span>
            <Button variant="secondary" onClick={() => void s.remove(meta.id)}>
              Yes, delete
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        ) : (
          <div className="project-card__actions">
            <Button
              disabled={s.loading}
              onClick={() =>
                void s.open(meta.id).then((ok) => {
                  if (ok) useShell.getState().closeGallery();
                })
              }
            >
              Open
            </Button>
            <Button variant="ghost" onClick={() => setRenaming(true)}>
              Rename
            </Button>
            <Button variant="ghost" onClick={() => void s.duplicate(meta.id)}>
              Duplicate
            </Button>
            <Button variant="ghost" onClick={() => void s.exportFile(meta.id)}>
              Save file
            </Button>
            <IconButton label={`Delete ${meta.name}`} onClick={() => setConfirming(true)}>
              🗑
            </IconButton>
          </div>
        )}
      </div>
    </li>
  );
}

/** Small text in the top bar that says whether the work is safe. */
export function SaveStatus() {
  const status = useProjectStore((s) => s.status);
  const name = useProjectStore((s) => s.name);
  const error = useProjectStore((s) => s.error);
  if (status === 'idle') return null;
  const text =
    status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : error || 'Could not save';
  return (
    <span
      className={`save-status ${status === 'error' ? 'save-status--bad' : ''}`}
      role="status"
      aria-live="polite"
      title={status === 'saved' ? `Saved: ${name}` : text}
    >
      {text}
    </span>
  );
}

export function ProjectsModal() {
  const s = useProjectStore();
  const open = useShell((x) => x.galleryOpen);
  const closeGallery = useShell((x) => x.closeGallery);
  const refresh = s.refresh;
  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);
  const fileRef = useRef<HTMLInputElement>(null);
  const full = nearlyFull(s.usage);
  const pct = s.usage ? Math.min(100, (s.usage.usage / s.usage.quota) * 100) : undefined;

  return (
    <Modal
      open={open}
      title="Your projects"
      onClose={closeGallery}
      footer={<Button onClick={closeGallery}>Done</Button>}
    >
      <p>
        Your work saves itself in this browser, so it is still here after you close the page.
        Nothing is sent anywhere.
      </p>

      <div className="projects-toolbar">
        <Button
          variant="secondary"
          onClick={() => {
            void (async () => {
              await s.saveNow();
              window.location.reload();
            })();
          }}
        >
          New project
        </Button>
        <Button variant="ghost" onClick={() => fileRef.current?.click()}>
          Open a .tridge file
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".tridge,application/zip"
          className="sr-only"
          aria-label="Choose a .tridge file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void s.importFile(f);
          }}
        />
      </div>

      <div className="projects-storage">
        {s.usage ? (
          <>
            <ProgressBar label="Browser storage used" value={pct} />
            <p className={full ? 'projects-storage__warn' : 'muted'}>
              {full
                ? `Your browser storage is almost full (${formatBytes(s.usage.usage)} of ${formatBytes(s.usage.quota)}). Delete projects you do not need, or save them as .tridge files first.`
                : `Using ${formatBytes(s.usage.usage)} of about ${formatBytes(s.usage.quota)} that this browser allows.`}
            </p>
          </>
        ) : (
          <p className="muted">This browser does not say how much storage is left.</p>
        )}
        {s.persisted === false && (
          <p className="muted">
            The browser may clear this storage if your disk runs low. Save important projects as
            .tridge files too.
          </p>
        )}
      </div>

      <div role="status" aria-live="polite">
        {s.message && <p className="projects-message">{s.message}</p>}
      </div>

      {s.projects.length === 0 ? (
        <p className="muted">
          No projects yet. Make or open a model and it will appear here by itself.
        </p>
      ) : (
        <ul className="project-list">
          {s.projects.map((p) => (
            <Card key={p.id} meta={p} current={p.id === s.currentId} />
          ))}
        </ul>
      )}
    </Modal>
  );
}
