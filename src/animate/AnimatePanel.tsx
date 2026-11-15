import { useId, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Button, ChipButton, IconButton, Panel, Slider, Toggle } from '../design/components';
import '../craft/ui/craft.css';
import { labelOf } from './parser';
import type { SeqStep } from './player';
import { useAnimStore } from './store';
import './AnimatePanel.css';

const mmss = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
};

/** A short phrase for a step's settings, such as "slow, big, twice". */
function describe(step: SeqStep): string {
  const bits: string[] = [];
  const { speed, intensity, duration } = step.params;
  if (speed <= 0.8) bits.push(speed <= 0.5 ? 'very slow' : 'slow');
  else if (speed >= 1.25) bits.push(speed >= 2 ? 'very fast' : 'fast');
  if (intensity >= 1.25) bits.push(intensity >= 1.7 ? 'huge' : 'big');
  else if (intensity <= 0.8) bits.push(intensity <= 0.5 ? 'tiny' : 'small');
  if ((step.repeat ?? 1) > 1) bits.push(`${step.repeat} times`);
  if (duration) bits.push(`${duration}s`);
  return bits.join(', ');
}

export function AnimatePanel() {
  const promptId = useId();
  const [text, setText] = useState('');
  const [poseName, setPoseName] = useState('');
  const s = useAnimStore();
  const rigged = s.targetType !== null;

  const submit = (mode: 'replace' | 'append') => {
    if (!text.trim()) {
      s.submit('', mode);
      return;
    }
    s.submit(text, mode);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit('replace');
    }
  };

  return (
    <Panel title="Animate" accent="mint" className="craft animate">
      <p className="muted">
        {rigged
          ? `This model has a ${s.targetType} skeleton, so it can walk, jump and more.`
          : 'This model has no skeleton, so it can only move as a whole. Rig it in the Rig tab for walking, jumping and more.'}
      </p>

      <div className="field">
        <label htmlFor={promptId}>Tell it what to do</label>
        <textarea
          id={promptId}
          rows={2}
          value={text}
          placeholder="walk slowly then jump high"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
      </div>
      <div className="craft-row">
        <Button onClick={() => submit('replace')}>Play it</Button>
        <Button variant="ghost" onClick={() => submit('append')}>
          Add to timeline
        </Button>
      </div>
      <p className="muted">
        English and Indonesian both work: "kucing jalan pelan terus loncat tinggi".
      </p>

      <div role="status" aria-live="polite">
        {s.message && <p className="animate-reply">{s.message}</p>}
        {s.suggestions.length > 0 && (
          <div className="rig-types" role="group" aria-label="Suggestions">
            {s.suggestions.map((id) => (
              <ChipButton key={id} color="sky" onClick={() => s.add(id)}>
                {labelOf(id)}
              </ChipButton>
            ))}
          </div>
        )}
      </div>

      <section aria-label="Moves to try">
        <h3>Moves to try</h3>
        <div className="rig-types" role="group" aria-label="Moves">
          {s.entries.map((e) => (
            <ChipButton
              key={e.id}
              color={e.kind === 'clip' ? 'mint' : 'violet'}
              onClick={() => s.add(e.id)}
            >
              {e.label}
            </ChipButton>
          ))}
        </div>
      </section>

      <section aria-label="Timeline">
        <h3>Timeline</h3>
        {s.steps.length === 0 ? (
          <p className="muted">Nothing yet. Type a request above or tap a move.</p>
        ) : (
          <ol className="timeline">
            {s.steps.map((step, i) => (
              <li key={`${step.id}-${i}`} className="timeline__step">
                <span className="timeline__num">{i + 1}</span>
                <span className="timeline__name">
                  {labelOf(step.id)}
                  {describe(step) && <span className="muted"> {describe(step)}</span>}
                </span>
                <IconButton
                  label={`Move ${labelOf(step.id)} earlier`}
                  onClick={() => s.move(i, -1)}
                  disabled={i === 0}
                >
                  ↑
                </IconButton>
                <IconButton
                  label={`Move ${labelOf(step.id)} later`}
                  onClick={() => s.move(i, 1)}
                  disabled={i === s.steps.length - 1}
                >
                  ↓
                </IconButton>
                <IconButton label={`Remove ${labelOf(step.id)}`} onClick={() => s.remove(i)}>
                  ✕
                </IconButton>
              </li>
            ))}
          </ol>
        )}

        {s.steps.length > 0 && (
          <>
            <div className="craft-row">
              <Button onClick={s.playing ? s.pause : s.play}>{s.playing ? 'Pause' : 'Play'}</Button>
              <Button variant="ghost" onClick={s.stop}>
                Stop
              </Button>
              <Button variant="ghost" onClick={s.clear}>
                Clear
              </Button>
            </div>
            <Slider
              label="Scrub"
              value={Math.min(s.time, s.total)}
              min={0}
              max={Math.max(0.1, s.total)}
              step={0.01}
              format={(v) => `${mmss(v)} of ${mmss(s.total)}`}
              onChange={(v) => {
                s.pause();
                s.seek(v);
              }}
            />
            <Slider
              label="Speed"
              value={s.speed}
              min={0.25}
              max={3}
              step={0.05}
              format={(v) => `${v.toFixed(2)}x`}
              onChange={s.setSpeed}
            />
            <Toggle label="Loop the whole timeline" checked={s.loop} onChange={s.setLoop} />
          </>
        )}
      </section>

      {rigged && (
        <section aria-label="Poses">
          <h3>Poses</h3>
          <p className="muted">
            Scrub to a moment you like, pause, then save that frame as a still pose.
          </p>
          <div className="craft-row">
            <div className="field animate-name">
              <label htmlFor={`${promptId}-pose`}>Pose name</label>
              <input
                id={`${promptId}-pose`}
                type="text"
                value={poseName}
                placeholder="Mid-jump"
                onChange={(e) => setPoseName(e.target.value)}
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                s.pause();
                s.savePose(poseName);
                setPoseName('');
              }}
            >
              Save this frame
            </Button>
          </div>
          {s.poses.length > 0 && (
            <ul className="timeline">
              {s.poses.map((p) => (
                <li key={p.id} className="timeline__step">
                  <span className="timeline__name">{p.name}</span>
                  <Button variant="ghost" onClick={() => s.applyPose(p.id)}>
                    Show
                  </Button>
                  <IconButton label={`Delete ${p.name}`} onClick={() => s.deletePose(p.id)}>
                    ✕
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="muted">
        Requests are understood by a built-in word list, so this works offline.
      </p>
    </Panel>
  );
}
