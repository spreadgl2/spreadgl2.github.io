export interface WarmupCapabilities {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  connection?: {
    saveData?: boolean;
    effectiveType?: string;
  };
}

let moduleWarmupStarted = false;

export function shouldWarmColdStartResources(capabilities: WarmupCapabilities): boolean {
  if (capabilities.connection?.saveData) return false;
  if (
    capabilities.connection?.effectiveType === 'slow-2g' ||
    capabilities.connection?.effectiveType === '2g'
  ) {
    return false;
  }
  if (capabilities.hardwareConcurrency !== undefined && capabilities.hardwareConcurrency <= 4) {
    return false;
  }
  return capabilities.deviceMemory === undefined || capabilities.deviceMemory > 4;
}

function browserWarmupCapabilities(): WarmupCapabilities {
  if (typeof navigator === 'undefined') return {};
  const extended = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  return {
    hardwareConcurrency: navigator.hardwareConcurrency,
    ...(extended.deviceMemory !== undefined ? { deviceMemory: extended.deviceMemory } : {}),
    ...(extended.connection ? { connection: extended.connection } : {}),
  };
}

function warmViewerModules(): void {
  void Promise.allSettled([import('./UnifiedDeckViewer'), import('maplibre-gl')]);
}

export function warmColdStartResources(): void {
  if (
    typeof window === 'undefined' ||
    import.meta.env.MODE === 'test' ||
    !shouldWarmColdStartResources(browserWarmupCapabilities())
  ) {
    return;
  }

  if (!moduleWarmupStarted) {
    moduleWarmupStarted = true;
    warmViewerModules();
  }
}
