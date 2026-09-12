/**
 * Job kick-off + crash-recovery sweep. In-process, no broker (DECISIONS.md).
 * - enqueue(): adds to a FIFO queue; a single pump processes ONE job at a
 *   time. This is what makes batch generation (many scripts queued at once,
 *   brief-adjacent feature added 2026-09) safe against a real GPU worker —
 *   two generation jobs running concurrently would both hit the same
 *   worker's /run endpoint at once and fight over the same GPU's VRAM,
 *   exactly like the training-side duplicate-submission incident this same
 *   session (see training/orchestrator.ts's comment for the postmortem).
 * - sweep(): re-pick jobs left in a non-terminal state (e.g. after a dev-server
 *   restart mid-generation). Cheap; safe to call on every status poll.
 *
 * `started`/`queue`/`processing` are stashed on globalThis, not module scope
 * — Next.js dev mode re-evaluates a server module (resetting plain `const`
 * state) whenever any file in its dependency chain changes, which would
 * otherwise let the same job be enqueued twice. See the training orchestrator
 * fix for the incident that established this pattern.
 */
import { listJobsByStates, NON_TERMINAL_STATES } from "../repo";
import { logger } from "../logger";
import { processJob } from "./orchestrator";

const g = globalThis as unknown as {
  __genStarted?: Set<string>;
  __genQueue?: string[];
  __genProcessing?: boolean;
  __genLastSweep?: number;
};
const started = (g.__genStarted ??= new Set<string>());
const queue = (g.__genQueue ??= []);

function pump(): void {
  if (g.__genProcessing) return;
  g.__genProcessing = true;
  (async () => {
    while (queue.length > 0) {
      const jobId = queue.shift()!;
      try {
        await processJob(jobId);
      } catch (e) {
        logger.error("processJob crashed", { jobId, error: String(e) });
      } finally {
        started.delete(jobId);
      }
    }
    g.__genProcessing = false;
  })();
}

export function enqueue(jobId: string): void {
  if (started.has(jobId)) return;
  started.add(jobId);
  queue.push(jobId);
  pump();
}

export function sweep(): void {
  const now = Date.now();
  if (now - (g.__genLastSweep ?? 0) < 3000) return; // throttle
  g.__genLastSweep = now;
  for (const job of listJobsByStates(NON_TERMINAL_STATES)) {
    if (!started.has(job.id)) enqueue(job.id);
  }
}
