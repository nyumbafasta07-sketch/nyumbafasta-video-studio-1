/**
 * Structured job logging (brief §7). JSON lines to stdout + storage/logs/jobs.log.
 * Never logs secrets — a redaction pass drops known-sensitive keys.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

const SENSITIVE = new Set([
  "password",
  "passwordHash",
  "APP_PASSWORD_HASH",
  "session",
  "sessionSecret",
  "SESSION_SECRET",
  "cookie",
  "token",
  "GPU_WORKER_TOKEN",
  "authorization",
]);

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE.has(k)) out[k] = "[redacted]";
    else if (v && typeof v === "object" && !Array.isArray(v))
      out[k] = redact(v as Record<string, unknown>);
    else out[k] = v;
  }
  return out;
}

function write(line: Record<string, unknown>): void {
  const entry = JSON.stringify({ ts: new Date().toISOString(), ...redact(line) });
  // eslint-disable-next-line no-console
  console.log(entry);
  try {
    const dir = path.join(config.storageDir, "logs");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "jobs.log"), entry + "\n");
  } catch {
    /* logging must never throw */
  }
}

export interface JobLogFields {
  projectId: string;
  jobId: string;
  provider?: string;
  model?: string;
  stage?: string;
  durationMs?: number;
  error?: string;
  [k: string]: unknown;
}

export const logger = {
  job(event: string, fields: JobLogFields): void {
    write({ kind: "job", event, ...fields });
  },
  info(msg: string, fields: Record<string, unknown> = {}): void {
    write({ kind: "info", msg, ...fields });
  },
  warn(msg: string, fields: Record<string, unknown> = {}): void {
    write({ kind: "warn", msg, ...fields });
  },
  error(msg: string, fields: Record<string, unknown> = {}): void {
    write({ kind: "error", msg, ...fields });
  },
};
