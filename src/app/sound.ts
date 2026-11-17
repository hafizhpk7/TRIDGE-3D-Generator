import { create } from 'zustand';

const KEY = 'tridge.sounds';

function readSaved(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

interface SoundState {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
}

/** UI sounds are off until the person turns them on. */
export const useSound = create<SoundState>((set) => ({
  enabled: readSaved(),
  setEnabled: (enabled) => {
    try {
      localStorage.setItem(KEY, enabled ? 'on' : 'off');
    } catch {
      // storage can be blocked; the choice then lasts until the page closes
    }
    set({ enabled });
    if (enabled) playSound('done', true);
  },
}));

export type SoundName = 'done' | 'export';

/** Notes of each sound as [frequency in Hz, seconds from the start]. */
export const SOUNDS: Record<SoundName, [number, number][]> = {
  // a quick rising arpeggio: something finished
  done: [
    [523.25, 0],
    [659.25, 0.09],
    [783.99, 0.18],
  ],
  // two notes, down then up: a file was saved
  export: [
    [392, 0],
    [523.25, 0.1],
  ],
};

let ctx: AudioContext | null = null;

/** Play a short synthesized chime, if sounds are on. There are no audio files to download. */
export function playSound(name: SoundName, force = false) {
  if (!force && !useSound.getState().enabled) return;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    const start = ctx.currentTime + 0.02;
    for (const [freq, at] of SOUNDS[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start + at);
      gain.gain.exponentialRampToValueAtTime(0.12, start + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + at);
      osc.stop(start + at + 0.25);
    }
  } catch {
    // sound is a nicety; never let it break anything
  }
}
