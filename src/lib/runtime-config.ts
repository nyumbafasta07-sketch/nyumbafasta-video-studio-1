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
  if (patch.gpuWorkerUrl !== undefined)
    setSetting(KEYS.gpuWorkerUrl, patch.gpuWorkerUrl.trim().replace(/\/$/, ""));
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
  };
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
