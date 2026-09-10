import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "@/lib/config";
import { _resetDbForTests, getDb } from "@/lib/db";
import { _setStorageForTests } from "@/lib/storage";
import { _setGpuForTests } from "@/lib/providers/gpu";
import { ensureSeed } from "@/lib/repo";

export interface TestEnv {
  dir: string;
  cleanup(): void;
}

/** Fresh temp storage dir + sqlite file + reset singletons. Call in beforeEach. */
export function freshEnv(): TestEnv {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vs-test-"));
  const mutable = config as { storageDir: string; databaseFile: string };
  mutable.storageDir = dir;
  mutable.databaseFile = path.join(dir, "studio.sqlite");

  _setStorageForTests(null);
  _setGpuForTests(null);
  _resetDbForTests(mutable.databaseFile);
  getDb();
  ensureSeed();

  return {
    dir,
    cleanup() {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}
