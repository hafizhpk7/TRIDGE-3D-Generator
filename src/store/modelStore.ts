import { create } from 'zustand';

export interface PendingModel {
  blob: Blob;
  name: string;
  /** True for freshly generated models, which get the confetti burst. */
  celebrate: boolean;
  nonce: number;
}

interface ModelState {
  pending: PendingModel | null;
  /** Hand a model to the viewer. */
  show: (blob: Blob, name: string, celebrate?: boolean) => void;
}

let counter = 0;

export const useModelStore = create<ModelState>((set) => ({
  pending: null,
  show: (blob, name, celebrate = false) =>
    set({ pending: { blob, name, celebrate, nonce: ++counter } }),
}));
