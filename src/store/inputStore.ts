import { create } from 'zustand';

export interface PreparedImage {
  blob: Blob;
  url: string;
  size: number;
  backgroundRemoved: boolean;
}

interface InputState {
  prepared: PreparedImage | null;
  /** A picture handed over from another part of the app (for example a generated picture). */
  incoming: File | null;
  setIncoming: (file: File | null) => void;
  setPrepared: (img: Omit<PreparedImage, 'url'>) => void;
  clear: () => void;
}

export const useInputStore = create<InputState>((set, get) => ({
  prepared: null,
  incoming: null,
  setIncoming: (incoming) => set({ incoming }),
  setPrepared: (img) => {
    const old = get().prepared;
    if (old) URL.revokeObjectURL(old.url);
    set({ prepared: { ...img, url: URL.createObjectURL(img.blob) } });
  },
  clear: () => {
    const old = get().prepared;
    if (old) URL.revokeObjectURL(old.url);
    set({ prepared: null });
  },
}));
