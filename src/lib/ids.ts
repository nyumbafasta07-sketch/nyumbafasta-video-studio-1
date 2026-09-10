import { randomUUID } from "node:crypto";

/** Prefixed UUIDs so ids are self-describing in logs and storage paths. */
export function newId(prefix: "proj" | "job" | "asset" | "voice" | "avatar"): string {
  return `${prefix}_${randomUUID()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
