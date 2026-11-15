import { useEffect } from 'react';
import { Button, ChipButton, ProgressBar, Slider, Toggle } from '../design/components';
import { SelectField } from '../craft/ui/fields';
import '../craft/ui/craft.css';
import { getEngine } from './bridge';
import { FACINGS, type Facing } from './frame';
import { MOTIONS } from './motions';
import { RIG_BODY_TYPES, SKELETONS, jointColor } from './skeleton';
import { useRigStore } from './store';

const FLIP: Record<Facing, Facing> = { '+z': '-z', '-z': '+z', '+x': '-x', '-x': '+x' };

/** Keeps the viewer's joint markers in step with the rig store while this panel is open. */
function useMarkers() {
  const status = useRigStore((s) => s.status);
  const epoch = useRigStore((s) => s.markerEpoch);
  const bodyType = useRigStore((s) => s.bodyType);
  const posing = useRigStore((s) => s.pose !== 0);

  useEffect(() => {
    const engine = getEngine();
    if (!engine) return;
    const show = (status === 'placing' || status === 'rigged') && !posing;
    if (!show) {
      engine.setMarkers(null);
      return;
    }
    const { joints } = useRigStore.getState();
    engine.setMarkers(
      SKELETONS[bodyType].map((j) => ({
        name: j.name,
        parent: j.parent,
        position: joints[j.name],
        color: jointColor(j.name),
      })),
    );
    engine.onMarkerDrag((name, position) => {
      if (position) useRigStore.getState().moveJoint(name, position);
    });
  }, [status, epoch, bodyType, posing]);

  // Leaving the panel hides the markers and stops any whole-model motion.
  useEffect(
    () => () => {
      const engine = getEngine();
      engine?.setMarkers(null);
      engine?.onMarkerDrag(null);
      useRigStore.getState().setMotion(null);
    },
    [],
  );
}

export function RigPanel({ craft }: { craft: boolean }) {
  const s = useRigStore();
  useMarkers();
  const hasModel = Boolean(getEngine()?.getRigSource());
  const busy = s.status === 'skinning';
  const placed = s.status === 'placing' || s.status === 'rigged' || busy;

  return (
    <div className="craft rig">
      {craft ? (
        <p className="muted">
          This Craft model is already rigged. Move its joints in Craft, on the Edit tab, under
          Bones.
        </p>
      ) : (
        <>
          <p className="muted">
            Give the model a skeleton so it can move. Pick a body type, drag the joints into place,
            then rig it.
          </p>

          <section aria-label="Body type">
            <h3>1. Body type</h3>
            <div className="rig-types" role="radiogroup" aria-label="Body type">
              {RIG_BODY_TYPES.map((t) => (
                <ChipButton
                  key={t.id}
                  color="violet"
                  role="radio"
                  aria-checked={placed && s.bodyType === t.id}
                  aria-pressed={undefined}
                  className={placed && s.bodyType === t.id ? 'chip--on' : ''}
                  title={t.hint}
                  disabled={!hasModel || busy}
                  onClick={() => s.setBodyType(t.id)}
                >
                  {t.label}
                </ChipButton>
              ))}
            </div>
            {!hasModel && <p className="muted">Load or make a model first.</p>}
            {hasModel && !placed && (
              <Button variant="secondary" onClick={() => s.begin()}>
                Place skeleton
              </Button>
            )}
          </section>

          {placed && (
            <>
              <section aria-label="Joints">
                <h3>2. Joints</h3>
                <p className="muted">
                  Drag the colored dots onto the joints. The white lines show how bones connect.
                </p>
                <div className="craft-row">
                  <SelectField
                    label="Which way is the front?"
                    value={s.facing}
                    options={FACINGS.map((f) => ({ value: f.id, label: f.label }))}
                    onChange={(v) => s.setFacing(v as Facing)}
                  />
                  <Button
                    variant="ghost"
                    onClick={() => s.setFacing(FLIP[s.facing])}
                    disabled={busy}
                  >
                    Flip front and back
                  </Button>
                </div>
                <Toggle label="Mirror left and right" checked={s.mirror} onChange={s.setMirror} />
                {s.notes.length > 0 && (
                  <ul className="rig-notes">
                    {s.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-label="Rig it">
                <h3>3. Rig it</h3>
                {busy ? (
                  <div role="status">
                    <p>Working out how each part follows the bones…</p>
                    <ProgressBar label="Skinning" />
                  </div>
                ) : (
                  <div className="craft-row">
                    <Button
                      onClick={() => void s.rig()}
                      disabled={s.status === 'rigged' && !s.dirty}
                    >
                      {s.status === 'rigged' ? 'Rig again' : 'Rig it'}
                    </Button>
                    {s.status === 'rigged' && (
                      <Button variant="ghost" onClick={s.removeRig}>
                        Remove rig
                      </Button>
                    )}
                  </div>
                )}
                {s.dirty && !busy && (
                  <p className="craft-warn">
                    You moved joints after rigging. Rig again to apply the change.
                  </p>
                )}
                {s.error && (
                  <p className="craft-error" role="alert">
                    {s.error}
                  </p>
                )}
              </section>

              {s.status === 'rigged' && (
                <section aria-label="Check the rig">
                  <h3>Check it</h3>
                  <Slider
                    label="Test pose"
                    value={Math.round(s.pose * 100)}
                    min={-100}
                    max={100}
                    step={1}
                    format={(n) => (n === 0 ? 'Rest' : n > 0 ? `Forward ${n}%` : `Back ${-n}%`)}
                    onChange={(n) => s.setPose(n / 100)}
                  />
                  <Toggle
                    label="Show skin weights as colors"
                    checked={s.weights}
                    onChange={s.setWeights}
                  />
                  <p className="muted">
                    Each color is one bone. Smooth blends at the joints are good. Torn or stretched
                    parts mean a joint is in the wrong place.
                  </p>
                </section>
              )}
            </>
          )}
        </>
      )}

      <section aria-label="Whole-model motion">
        <h3>Move the whole model</h3>
        <p className="muted">These need no skeleton, so they work on any model.</p>
        <div className="rig-types" role="group" aria-label="Motions">
          {MOTIONS.map((m) => (
            <ChipButton
              key={m.id}
              color="mint"
              aria-pressed={s.motion === m.id}
              title={m.hint}
              disabled={!hasModel && !craft}
              onClick={() => s.setMotion(s.motion === m.id ? null : m.id)}
            >
              {m.label}
            </ChipButton>
          ))}
        </div>
        <Slider
          label="Speed"
          value={s.motionSpeed}
          min={0.25}
          max={3}
          step={0.05}
          format={(n) => `${n.toFixed(2)}x`}
          onChange={(v) => s.setMotionParams({ speed: v })}
        />
        <Slider
          label="Size of movement"
          value={s.motionIntensity}
          min={0}
          max={2}
          step={0.05}
          format={(n) => `${Math.round(n * 100)}%`}
          onChange={(v) => s.setMotionParams({ intensity: v })}
        />
      </section>

      {!craft && (
        <p className="muted">
          Automatic AI rigging is not offered yet: the free online services for it are not running
          right now.
        </p>
      )}
    </div>
  );
}
