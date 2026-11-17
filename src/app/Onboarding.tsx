import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../design/components';
import { TOUR, markTourSeen, placeCard, type Box } from './tour';
import './Onboarding.css';

function measure(target: string): Box | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return null;
  const pad = 6;
  return {
    top: Math.max(0, r.top - pad),
    left: Math.max(0, r.left - pad),
    width: r.width + pad * 2,
    height: r.height + pad * 2,
  };
}

/** A first-run tour of three short steps over the real page. Skippable at any time. */
export function Onboarding({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [pos, setPos] = useState({ top: 80, left: 20 });
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const step = TOUR[index];
  const last = index === TOUR.length - 1;

  const finish = useCallback(() => {
    markTourSeen();
    onClose();
  }, [onClose]);

  // follow the target as the window changes size
  useLayoutEffect(() => {
    const update = () => {
      const b = measure(step.target);
      setBox(b);
      const card = cardRef.current;
      setPos(
        placeCard(
          b,
          { width: card?.offsetWidth ?? 320, height: card?.offsetHeight ?? 200 },
          { width: window.innerWidth, height: window.innerHeight },
        ),
      );
    };
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    // bring the highlighted area fully into sight when it is cut off
    const r = el?.getBoundingClientRect();
    if (el && r && (r.top < 0 || r.bottom > window.innerHeight))
      el.scrollIntoView({ block: r.height > window.innerHeight ? 'start' : 'center' });
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step.target]);

  // keyboard: Escape skips, arrows move, Tab stays inside the card
  useEffect(() => {
    const first = cardRef.current?.querySelector<HTMLElement>('button[data-primary]');
    first?.focus();
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish();
      } else if (e.key === 'ArrowRight') setIndex((i) => Math.min(TOUR.length - 1, i + 1));
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      else if (e.key === 'Tab') {
        const items = Array.from(cardRef.current?.querySelectorAll<HTMLElement>('button') ?? []);
        if (!items.length) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [finish]);

  return (
    <div className="tour" role="presentation">
      {box ? (
        <div
          className="tour__spot"
          style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
        />
      ) : (
        <div className="tour__dim" />
      )}
      <div
        ref={cardRef}
        className="tour__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ top: pos.top, left: pos.left }}
      >
        <p className="tour__count">
          Step {index + 1} of {TOUR.length}
        </p>
        <h2 id={titleId} className="tour__title">
          {step.title}
        </h2>
        <p className="tour__body">{step.body}</p>
        <div className="tour__actions">
          <Button variant="ghost" onClick={finish}>
            Skip
          </Button>
          {index > 0 && (
            <Button variant="secondary" onClick={() => setIndex(index - 1)}>
              Back
            </Button>
          )}
          <Button data-primary onClick={last ? finish : () => setIndex(index + 1)}>
            {last ? 'Start making' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
