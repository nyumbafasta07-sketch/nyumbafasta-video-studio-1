/**
 * Runtime-editable provider settings. Env vars are the defaults; values set in
 * the Settings UI are stored in the `settings` table and win. This lets the
 * founder point the app at any GPU worker (Colab tunnel, Kaggle, a local NVIDIA
 * box, …) without editing .env or restarting.
 *
 * The worker token lives in the local, git-ignored SQLite file — never in
 * source, never committed, never logged, never returned by the API (see
 * SECURITY.md, DECISIONS.md).
 */
import { config } from "./config";
import { getSetting, setSetting } from "./repo";

const KEYS = {
  gpuProvider: "rt_gpu_provider",
  gpuWorkerUrl: "rt_gpu_worker_url",
  gpuWorkerToken: "rt_gpu_worker_token",
  trainingProvider: "rt_training_provider",
  gpuProfiles: "rt_gpu_profiles",
  activeGpuProfile: "rt_active_gpu_profile",
} as const;

export type GpuProviderName = "local-mock" | "http";
export type TrainingProviderName = "mock" | "worker";

export interface RuntimeConfig {
  gpuProvider: GpuProviderName;
  gpuWorkerUrl: string;
  gpuWorkerToken: string;
  trainingProvider: TrainingProviderName;
}

export function getRuntimeConfig(): RuntimeConfig {
  return {
    gpuProvider: (getSetting(KEYS.gpuProvider) ?? config.providers.gpu) as GpuProviderName,
    gpuWorkerUrl: getSetting(KEYS.gpuWorkerUrl) ?? config.gpuWorker.url,
    gpuWorkerToken: getSetting(KEYS.gpuWorkerToken) ?? config.gpuWorker.token,
    trainingProvider: (getSetting(KEYS.trainingProvider) ??
      config.providers.training) as TrainingProviderName,
  };
}

export interface RuntimeConfigPatch {
  gpuProvider?: GpuProviderName;
  gpuWorkerUrl?: string;
  gpuWorkerToken?: string; // "" leaves the stored value untouched
  trainingProvider?: TrainingProviderName;
}

export function setRuntimeConfig(patch: RuntimeConfigPatch): void {
  if (patch.gpuProvider) setSetting(KEYS.gpuProvider, patch.gpuProvider);
  if (patch.gpuWorkerUrl !== undefined) {
    setSetting(KEYS.gpuWorkerUrl, patch.gpuWorkerUrl.trim().replace(/\/$/, ""));
    setSetting(KEYS.activeGpuProfile, ""); // manual URL edit — no longer "the Colab/Kaggle profile"
  }
  if (patch.gpuWorkerToken) setSetting(KEYS.gpuWorkerToken, patch.gpuWorkerToken);
  if (patch.trainingProvider) setSetting(KEYS.trainingProvider, patch.trainingProvider);
  clearProviderCaches();
}

/** API-safe view: the token becomes a boolean. */
export function redactedRuntimeConfig() {
  const rc = getRuntimeConfig();
  const profiles = getGpuProfiles();
  return {
    gpuProvider: rc.gpuProvider,
    gpuWorkerUrl: rc.gpuWorkerUrl,
    gpuWorkerTokenSet: rc.gpuWorkerToken.length > 0,
    trainingProvider: rc.trainingProvider,
    activeGpuProfile: getActiveGpuProfile(),
    gpuProfiles: Object.fromEntries(
      PROFILE_NAMES.map((name) => [
        name,
        { url: profiles[name].url, tokenSet: profiles[name].token.length > 0 },
      ]),
    ) as Record<GpuProfileName, { url: string; tokenSet: boolean }>,
  };
}

/**
 * Named GPU worker profiles ("colab", "kaggle", …) so the founder can save a
 * URL+token for each once and flip the ACTIVE one with a single button —
 * instead of re-pasting URL/token every time they switch backends (e.g.
 * Colab hits its free-tier GPU limit, so they switch to Kaggle for a while).
 * Activating a profile just copies its url/token into the single active
 * gpuWorkerUrl/gpuWorkerToken fields everything else already reads.
 */
export type GpuProfileName = "colab" | "kaggle" | "local";
export interface GpuProfile {
  url: string;
  token: string;
}
const PROFILE_NAMES: GpuProfileName[] = ["colab", "kaggle", "local"];

function readProfiles(): Record<GpuProfileName, GpuProfile> {
  const raw = getSetting(KEYS.gpuProfiles);
  let parsed: Partial<Record<GpuProfileName, GpuProfile>> = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
  }
  const out = {} as Record<GpuProfileName, GpuProfile>;
  for (const name of PROFILE_NAMES) {
    out[name] = { url: parsed[name]?.url ?? "", token: parsed[name]?.token ?? "" };
  }
  return out;
}

export function getGpuProfiles(): Record<GpuProfileName, GpuProfile> {
  return readProfiles();
}

export function getActiveGpuProfile(): GpuProfileName | "" {
  const v = getSetting(KEYS.activeGpuProfile) ?? "";
  return PROFILE_NAMES.includes(v as GpuProfileName) ? (v as GpuProfileName) : "";
}

/** Upsert one profile's saved url/token. "" for token leaves it unchanged. */
export function saveGpuProfile(name: GpuProfileName, patch: { url?: string; token?: string }): void {
  const profiles = readProfiles();
  const cur = profiles[name];
  profiles[name] = {
    url: patch.url !== undefined ? patch.url.trim().replace(/\/$/, "") : cur.url,
    token: patch.token ? patch.token : cur.token,
  };
  setSetting(KEYS.gpuProfiles, JSON.stringify(profiles));
}

/** Make a saved profile the active worker (generation + training). */
export function activateGpuProfile(name: GpuProfileName): GpuProfile {
  const profile = readProfiles()[name];
  if (!profile.url) throw new Error(`no URL saved for profile "${name}" yet — save one first`);
  setSetting(KEYS.gpuWorkerUrl, profile.url);
  if (profile.token) setSetting(KEYS.gpuWorkerToken, profile.token);
  setSetting(KEYS.gpuProvider, "http" satisfies GpuProviderName);
  setSetting(KEYS.trainingProvider, "worker" satisfies TrainingProviderName);
  setSetting(KEYS.activeGpuProfile, name);
  clearProviderCaches();
  return profile;
}

/* provider modules register a reset callback so a settings change takes effect
   without a restart */
const resets: Array<() => void> = [];
export function onProviderConfigChange(fn: () => void): void {
  resets.push(fn);
}
export function clearProviderCaches(): void {
  for (const fn of resets) fn();
}
