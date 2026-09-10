/**
 * Job kick-off + crash-recovery sweep. In-process, no broker (DECISIONS.md).
 * - enqueue(): fire-and-forget processing right after a job is created.
 * - sweep(): re-pick jobs left in a non-terminal state (e.g. after a dev-server
 *   restart mid-generation). Cheap; safe to call on every status poll.
 */
import { listJobsByStates, NON_TERMINAL_STATES } from "../repo";
import { logger } from "../logger";
import { processJob } from "./orchestrator";

const started = new Set<string>();

export function enqueue(jobId: string): void {
  if (started.has(jobId)) return;
  started.add(jobId);
  queueMicrotask(() => {
    processJob(jobId)
      .catch((e) => logger.error("processJob crashed", { jobId, error: String(e) }))
      .finally(() => started.delete(jobId));
  });
}

let lastSweep = 0;

export function sweep(): void {
  const now = Date.now();
  if (now - lastSweep < 3000) return; // throttle
  lastSweep = now;
  for (const job of listJobsByStates(NON_TERMINAL_STATES)) {
    if (!started.has(job.id)) enqueue(job.id);
  }
}
