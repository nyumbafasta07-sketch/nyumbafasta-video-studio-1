/**
 * Runtime-editable provider settings. Env vars are the defaults; values set in
 * the Settings UI are stored in the `settings` table and win. This lets the
 * founder point the app at any GPU worker (Colab tunnel, Kaggle, a local NVIDIA
 * box, a rented box, …) without editing .env or restarting.
 *
 * The worker token lives in the local, git-ignored SQLite file — never in
 * source, never committed, never logged, never returned by the API (see
 * SECURITY.md, DECISIONS.md).
 */
import { randomUUID } from "node:crypto";
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
    setSetting(KEYS.activeGpuProfile, ""); // manual URL edit — no longer "a saved profile"
  }
  if (patch.gpuWorkerToken) setSetting(KEYS.gpuWorkerToken, patch.gpuWorkerToken);
  if (patch.trainingProvider) setSetting(KEYS.trainingProvider, patch.trainingProvider);
  clearProviderCaches();
}

/** API-safe view: the token becomes a boolean. */
export function redactedRuntimeConfig() {
  const rc = getRuntimeConfig();
  return {
    gpuProvider: rc.gpuProvider,
    gpuWorkerUrl: rc.gpuWorkerUrl,
    gpuWorkerTokenSet: rc.gpuWorkerToken.length > 0,
    trainingProvider: rc.trainingProvider,
    activeGpuProfileId: getActiveGpuProfileId(),
    gpuProfiles: listGpuProfiles().map((p) => ({
      id: p.id,
      label: p.label,
      url: p.url,
      tokenSet: p.token.length > 0,
    })),
  };
}

/**
 * Saved GPU worker connections — any number, any name ("Colab", "RunPod",
 * "my desktop", …). Save a URL+token once, then flip the ACTIVE one with a
 * single button — instead of re-pasting URL/token every time you switch
 * backends (a free-tier limit hit, a machine going offline, whatever GPU
 * happens to be available right now). Activating a profile just copies its
 * url/token into the single active gpuWorkerUrl/gpuWorkerToken fields
 * everything else already reads — the app doesn't care which "kind" of GPU
 * it's talking to, only that it speaks worker/contract.md over HTTP.
 */
export interface GpuProfile {
  id: string;
  label: string;
  url: string;
  token: string;
}

function readProfiles(): GpuProfile[] {
  const raw = getSetting(KEYS.gpuProfiles);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is GpuProfile =>
        !!p && typeof p.id === "string" && typeof p.label === "string",
    );
  } catch {
    return [];
  }
}

function writeProfiles(profiles: GpuProfile[]): void {
  setSetting(KEYS.gpuProfiles, JSON.stringify(profiles));
}

export function listGpuProfiles(): GpuProfile[] {
  return readProfiles();
}

export function getActiveGpuProfileId(): string {
  return getSetting(KEYS.activeGpuProfile) ?? "";
}

/** Create a new profile (omit `id`) or update an existing one (pass `id`).
 * "" / omitted token leaves a stored token unchanged. Returns the profile id. */
export function saveGpuProfile(input: {
  id?: string;
  label: string;
  url?: string;
  token?: string;
}): string {
  const profiles = readProfiles();
  const label = input.label.trim().slice(0, 60) || "GPU";

  if (input.id) {
    const idx = profiles.findIndex((p) => p.id === input.id);
    if (idx === -1) throw new Error("profile not found");
    const cur = profiles[idx];
    profiles[idx] = {
      id: cur.id,
      label,
      url: input.url !== undefined ? input.url.trim().replace(/\/$/, "") : cur.url,
      token: input.token ? input.token : cur.token,
    };
    writeProfiles(profiles);
    return cur.id;
  }

  const id = randomUUID();
  profiles.push({
    id,
    label,
    url: (input.url ?? "").trim().replace(/\/$/, ""),
    token: input.token ?? "",
  });
  writeProfiles(profiles);
  return id;
}

export function deleteGpuProfile(id: string): void {
  writeProfiles(readProfiles().filter((p) => p.id !== id));
  if (getActiveGpuProfileId() === id) setSetting(KEYS.activeGpuProfile, "");
}

/** Make a saved profile the active worker (generation + training). */
export function activateGpuProfile(id: string): GpuProfile {
  const profile = readProfiles().find((p) => p.id === id);
  if (!profile) throw new Error("profile not found");
  if (!profile.url) throw new Error(`no URL saved for "${profile.label}" yet — save one first`);
  setSetting(KEYS.gpuWorkerUrl, profile.url);
  if (profile.token) setSetting(KEYS.gpuWorkerToken, profile.token);
  setSetting(KEYS.gpuProvider, "http" satisfies GpuProviderName);
  setSetting(KEYS.trainingProvider, "worker" satisfies TrainingProviderName);
  setSetting(KEYS.activeGpuProfile, id);
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
