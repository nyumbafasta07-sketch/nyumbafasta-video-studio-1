/**
 * Central env-var access. Every provider/impl choice is a string here so the
 * brief's "swap implementations behind env-var configuration" holds (§2.1).
 */
import path from "node:path";

function str(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Env var ${name} must be a number`);
  return n;
}

const storageDir = path.resolve(str("STORAGE_DIR", "./storage"));

export const config = {
  storageDir,
  databaseFile: path.resolve(str("DATABASE_FILE", path.join(storageDir, "studio.sqlite"))),

  session: {
    secret: str("SESSION_SECRET", "dev-insecure-secret-change-me"),
    ttlHours: num("SESSION_TTL_HOURS", 720),
  },
  // Not read here on purpose beyond existence; auth.ts reads the hash directly.
  passwordHashConfigured: (process.env.APP_PASSWORD_HASH ?? "") !== "",

  providers: {
    script: str("SCRIPT_PROVIDER", "mock"),
    voice: str("VOICE_PROVIDER", "mock"),
    face: str("FACE_PROVIDER", "mock"),
    lipsync: str("LIPSYNC_PROVIDER", "mock"),
    renderer: str("RENDERER", "ffmpeg"),
    gpu: str("GPU_PROVIDER", "local-mock"),
  },

  gpuWorker: {
    url: process.env.GPU_WORKER_URL ?? "",
    token: process.env.GPU_WORKER_TOKEN ?? "",
  },

  output: {
    width: num("OUTPUT_WIDTH", 1080),
    height: num("OUTPUT_HEIGHT", 1920),
    greenHex: str("GREEN_SCREEN_HEX", "#00b140"),
  },
} as const;

export type AppConfig = typeof config;
