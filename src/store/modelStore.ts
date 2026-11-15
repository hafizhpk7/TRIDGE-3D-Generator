import type { Object3D } from 'three';
import { create } from 'zustand';

export interface PendingModel {
  /** A GLB file to decode, or an object that is ready to show. */
  blob?: Blob;
  object?: Object3D;
  name: string;
  /** True for freshly generated models, which get the confetti burst. */
  celebrate: boolean;
  /** Short label shown next to the stats, such as "2.5D relief". */
  badge?: string;
  nonce: number;
}

interface ModelState {
  pending: PendingModel | null;
  /** Hand a GLB to the viewer. */
  show: (blob: Blob, name: string, celebrate?: boolean) => void;
  /** Hand a ready-made three.js object to the viewer. */
  showObject: (
    object: Object3D,
    name: string,
    opts?: { celebrate?: boolean; badge?: string },
  ) => void;
}

let counter = 0;

export const useModelStore = create<ModelState>((set) => ({
  pending: null,
  show: (blob, name, celebrate = false) =>
    set({ pending: { blob, name, celebrate, nonce: ++counter } }),
  showObject: (object, name, opts = {}) =>
    set({
      pending: {
        object,
        name,
        celebrate: opts.celebrate ?? false,
        badge: opts.badge,
        nonce: ++counter,
      },
    }),
}));
