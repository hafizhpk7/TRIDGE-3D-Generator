import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from './ErrorBoundary';
import { TOUR, markTourSeen, placeCard, tourSeen } from './tour';
import { useShell } from './shellStore';
import { SOUNDS, playSound, useSound } from './sound';

describe('first-run tour', () => {
  beforeEach(() => localStorage.clear());

  it('shows until it has been finished or skipped', () => {
    expect(tourSeen()).toBe(false);
    markTourSeen();
    expect(tourSeen()).toBe(true);
  });

  it('has three short steps, each pointing at a different part of the page', () => {
    expect(TOUR).toHaveLength(3);
    expect(new Set(TOUR.map((s) => s.target)).size).toBe(3);
    for (const s of TOUR) expect(s.body.length).toBeLessThan(220);
  });

  it('never expands the product name', () => {
    for (const s of TOUR) expect(`${s.title} ${s.body}`).not.toMatch(/triangle\s+r/i);
  });
});

describe('placeCard', () => {
  const view = { width: 1000, height: 700 };
  const card = { width: 300, height: 180 };

  it('goes below the highlighted area when there is room', () => {
    const p = placeCard({ top: 50, left: 100, width: 200, height: 100 }, card, view);
    expect(p.top).toBeGreaterThan(150);
  });

  it('goes above when the area is at the bottom', () => {
    const p = placeCard({ top: 560, left: 100, width: 200, height: 100 }, card, view);
    expect(p.top).toBeLessThan(560);
  });

  it('always stays fully on screen', () => {
    for (const box of [
      { top: 0, left: 0, width: 1000, height: 700 },
      { top: 600, left: 900, width: 100, height: 100 },
      { top: 10, left: 950, width: 40, height: 40 },
    ]) {
      const p = placeCard(box, card, view);
      expect(p.left).toBeGreaterThanOrEqual(12);
      expect(p.top).toBeGreaterThanOrEqual(12);
      expect(p.left + card.width).toBeLessThanOrEqual(view.width - 12);
      expect(p.top + card.height).toBeLessThanOrEqual(view.height - 12);
    }
  });

  it('centres the card when there is nothing to point at', () => {
    const p = placeCard(null, card, view);
    expect(p.left).toBe(350);
    expect(p.top).toBe(260);
  });
});

describe('sounds', () => {
  afterEach(() => {
    localStorage.clear();
    useSound.setState({ enabled: false });
  });

  it('are off by default', () => {
    expect(useSound.getState().enabled).toBe(false);
  });

  it('stay silent while off', () => {
    const ctor = vi.fn();
    vi.stubGlobal('AudioContext', ctor);
    playSound('done');
    expect(ctor).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('remember the choice', () => {
    vi.stubGlobal('AudioContext', undefined);
    useSound.getState().setEnabled(true);
    expect(localStorage.getItem('tridge.sounds')).toBe('on');
    useSound.getState().setEnabled(false);
    expect(localStorage.getItem('tridge.sounds')).toBe('off');
    vi.unstubAllGlobals();
  });

  it('are short, rising and quiet enough to be pleasant', () => {
    for (const notes of Object.values(SOUNDS)) {
      expect(notes.length).toBeGreaterThan(1);
      expect(notes[notes.length - 1][1]).toBeLessThan(0.5);
    }
    const done = SOUNDS.done.map(([f]) => f);
    expect(done).toEqual([...done].sort((a, b) => a - b));
  });

  it('do not throw when the browser has no audio', () => {
    vi.stubGlobal('AudioContext', undefined);
    useSound.setState({ enabled: true });
    expect(() => playSound('export')).not.toThrow();
    vi.unstubAllGlobals();
  });
});

describe('shell state', () => {
  it('starts on the input step and tracks the open step', () => {
    useShell.getState().setStep('export');
    expect(useShell.getState().step).toBe('export');
    useShell.getState().setStep('input');
    expect(useShell.getState().step).toBe('input');
  });

  it('opens and closes the gallery', () => {
    useShell.getState().openGallery();
    expect(useShell.getState().galleryOpen).toBe(true);
    useShell.getState().closeGallery();
    expect(useShell.getState().galleryOpen).toBe(false);
  });
});

function Boom({ fail }: { fail: boolean }) {
  if (fail) throw new Error('kaboom');
  return <p>all good</p>;
}

describe('ErrorBoundary', () => {
  it('shows a way forward instead of a blank page, and recovers on retry', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let fail = true;
    const Flaky = () => <Boom fail={fail} />;
    render(
      <ErrorBoundary label="This panel">
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('This panel hit a problem');
    expect(screen.getByText(/projects are saved/i)).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('all good')).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('explains a failed download in plain words', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Gone = () => {
      throw new Error('Failed to fetch dynamically imported module');
    };
    render(
      <ErrorBoundary label="The viewer">
        <Gone />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/could not be downloaded/i)).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
