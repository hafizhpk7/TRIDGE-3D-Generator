import { create } from 'zustand';

/**
 * The few bits of page state that the first screen needs, kept apart from the heavy stores so the page
 * can appear before the 3D code has arrived.
 */
interface ShellState {
  /** Which workspace step is open. */
  step: string;
  setStep: (step: string) => void;
  /** A Craft model is open (set by the Craft store once it has loaded). */
  craft: boolean;
  galleryOpen: boolean;
  openGallery: () => void;
  closeGallery: () => void;
}

export const useShell = create<ShellState>((set) => ({
  step: 'input',
  setStep: (step) => set({ step }),
  craft: false,
  galleryOpen: false,
  openGallery: () => set({ galleryOpen: true }),
  closeGallery: () => set({ galleryOpen: false }),
}));
