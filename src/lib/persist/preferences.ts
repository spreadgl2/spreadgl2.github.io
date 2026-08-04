export type DateDisplay = 'iso' | 'decimal';
export type RenderQuality = 'auto' | 'quality' | 'performance';

export interface Preferences {
  theme: 'dark' | 'light' | 'system';
  dateDisplay: DateDisplay;
  reducedMotion: boolean;
  renderQuality: RenderQuality;
  treeSplitFraction: number;
  sidePanelWidth: number;
  datesPanelWidth: number;
  locationsPanelWidth: number;
  analysisPanelHeight: number;
  animationMode: string;
  animationSpeed: number;
  logBurnIn: number;
}

export const DEFAULTS: Preferences = {
  theme: 'dark',
  dateDisplay: 'iso',
  reducedMotion: false,
  renderQuality: 'auto',
  treeSplitFraction: 0.5,
  sidePanelWidth: 280,
  datesPanelWidth: 480,
  locationsPanelWidth: 384,
  analysisPanelHeight: 156,
  animationMode: 'Trail',
  animationSpeed: 1,
  logBurnIn: 0.1,
};

const STORAGE_KEY = 'spreadgl2_prefs';

const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// LazyStore is constructed synchronously; individual get/set calls are async.
// We use a module-level singleton so the store is shared across all callers.
let _lazyStore: {
  set(k: string, v: unknown): Promise<void>;
  get<T>(k: string): Promise<T | undefined>;
} | null = null;

async function getLazyStore() {
  if (_lazyStore) return _lazyStore;
  const { LazyStore } = await import('@tauri-apps/plugin-store');
  _lazyStore = new LazyStore('preferences.json', {
    defaults: DEFAULTS as unknown as { [key: string]: unknown },
    autoSave: true,
  });
  return _lazyStore;
}

function loadFromLocalStorage(): Partial<Preferences> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<Preferences>;
  } catch {
    return {};
  }
}

function saveToLocalStorage(prefs: Partial<Preferences>): void {
  try {
    const existing = loadFromLocalStorage();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, ...prefs }));
  } catch {
    // localStorage unavailable
  }
}

export function getPreferences(): Preferences {
  if (IS_TAURI) {
    return { ...DEFAULTS };
  }
  const stored = loadFromLocalStorage();
  return { ...DEFAULTS, ...stored } as Preferences;
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
  if (IS_TAURI) {
    getLazyStore()
      .then((store) => store.set(key as string, value))
      .catch(() => {});
    return;
  }
  saveToLocalStorage({ [key]: value } as Partial<Preferences>);
}

export async function clearAllPreferences(): Promise<void> {
  if (IS_TAURI) {
    try {
      const store = await getLazyStore();
      for (const key of Object.keys(DEFAULTS) as (keyof Preferences)[]) {
        await store.set(key as string, (DEFAULTS as unknown as Record<string, unknown>)[key]);
      }
    } catch {
      // store unavailable
    }
    return;
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable
  }
}

export async function loadPreferencesFromTauriStore(): Promise<Partial<Preferences>> {
  if (!IS_TAURI) return {};
  try {
    const store = await getLazyStore();
    const result: Partial<Preferences> = {};
    const keys = Object.keys(DEFAULTS) as (keyof Preferences)[];
    for (const key of keys) {
      const val = await store.get<Preferences[typeof key]>(key as string);
      if (val !== undefined && val !== null) {
        (result as Record<string, unknown>)[key] = val;
      }
    }
    return result;
  } catch {
    return {};
  }
}
