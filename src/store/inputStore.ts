import { create } from 'zustand';

export interface PreparedImage {
  blob: Blob;
  url: string;
  size: number;
  backgroundRemoved: boolean;
}

interface InputState {
  prepared: PreparedImage | null;
  setPrepared: (img: Omit<PreparedImage, 'url'>) => void;
  clear: () => void;
}

export const useInputStore = create<InputState>((set, get) => ({
  prepared: null,
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
