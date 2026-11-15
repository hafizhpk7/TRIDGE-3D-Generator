import { create } from 'zustand';
import { DEFAULT_ANTHROPIC_MODEL } from './anthropic';

const SETTINGS_KEY = 'tridge-craft-ai';
const KEY_KEY = 'tridge-craft-ai-key';

interface Saved {
  enabled: boolean;
  model: string;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readKey(): string {
  try {
    return localStorage.getItem(KEY_KEY) ?? '';
  } catch {
    return '';
  }
}

interface AIState extends Saved {
  /** The user's own API key. Kept only in this browser; never logged or exported. */
  apiKey: string;
  setEnabled: (v: boolean) => void;
  setModel: (v: string) => void;
  setApiKey: (v: string) => void;
  forgetKey: () => void;
}

function save(s: Saved) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
}

const saved = read<Partial<Saved>>(SETTINGS_KEY, {});

/** Direct API mode is off by default. */
export const useCraftAI = create<AIState>((set, get) => ({
  enabled: saved.enabled === true,
  model: saved.model || DEFAULT_ANTHROPIC_MODEL,
  apiKey: readKey(),
  setEnabled: (enabled) => {
    set({ enabled });
    save({ enabled, model: get().model });
  },
  setModel: (model) => {
    set({ model });
    save({ enabled: get().enabled, model });
  },
  setApiKey: (apiKey) => {
    const clean = apiKey.trim();
    try {
      if (clean) localStorage.setItem(KEY_KEY, clean);
      else localStorage.removeItem(KEY_KEY);
    } catch {
      /* storage unavailable: the key is kept for this session only */
    }
    set({ apiKey: clean });
  },
  forgetKey: () => {
    try {
      localStorage.removeItem(KEY_KEY);
    } catch {
      /* nothing to forget */
    }
    set({ apiKey: '', enabled: false });
    save({ enabled: false, model: get().model });
  },
}));
