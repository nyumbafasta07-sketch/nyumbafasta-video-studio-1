/**
 * SQLite via Node's built-in module (no native build, no Docker). See DECISIONS.md.
 * One connection per process, lazily opened. All callers go through repo.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { config } from "./config";

// node:sqlite is a recent builtin; import it via createRequire so bundlers that
// don't recognise the specifier (Next's webpack, Vitest's Vite) leave it alone.
const nodeRequire = createRequire(import.meta.url);
type DatabaseSyncCtor = new (path: string) => {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  close(): void;
};
const { DatabaseSync } = nodeRequire("node:sqlite") as {
  DatabaseSync: DatabaseSyncCtor;
};
type DatabaseSync = InstanceType<DatabaseSyncCtor>;

let db: DatabaseSync | null = null;

function schemaSql(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // Works both from src (dev/test) and compiled output next to this file.
  const candidates = [
    path.join(here, "schema.sql"),
    path.join(process.cwd(), "src/lib/schema.sql"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return fs.readFileSync(c, "utf8");
  }
  throw new Error("schema.sql not found");
}

export function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.databaseFile), { recursive: true });
  db = new DatabaseSync(config.databaseFile);
  db.exec(schemaSql());
  return db;
}

/** Test helper: point at a throwaway file and reset the singleton. */
export function _resetDbForTests(file: string): void {
  if (db) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
  db = null;
  (config as { databaseFile: string }).databaseFile = file;
}
