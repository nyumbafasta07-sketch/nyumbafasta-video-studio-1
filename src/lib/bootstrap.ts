import { getDb } from "./db";
import { ensureSeed } from "./repo";

let done = false;

/** Idempotent: open DB, apply schema, seed the mock voice/avatar. */
export function bootstrap(): void {
  if (done) return;
  getDb();
  ensureSeed();
  done = true;
}
