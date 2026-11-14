import { create } from 'zustand';
import { PROVIDERS } from '../pipeline/providers';
import type { ProviderStatus } from '../pipeline/providers';

const TOKEN_KEY = 'tridge-hf-token';

function readToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

interface ProviderState {
  statuses: Record<string, ProviderStatus>;
  checking: boolean;
  /** The user's own Hugging Face token. Kept only in this browser; never log it. */
  token: string;
  checkAll: () => Promise<void>;
  setToken: (token: string) => void;
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  statuses: {},
  checking: false,
  token: readToken(),
  checkAll: async () => {
    if (get().checking) return;
    set({ checking: true });
    const entries = await Promise.all(
      PROVIDERS.map(
        async (p) => [p.id, await p.healthCheck().catch(() => 'unknown' as const)] as const,
      ),
    );
    set({ statuses: Object.fromEntries(entries), checking: false });
  },
  setToken: (token) => {
    const clean = token.trim();
    try {
      if (clean) localStorage.setItem(TOKEN_KEY, clean);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable: the token is kept for this session only */
    }
    set({ token: clean });
  },
}));
