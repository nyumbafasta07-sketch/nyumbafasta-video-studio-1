/**
 * Background video ingestion. Upload must never fail because a remote worker
 * is slow/flaky/unreachable — the file is stored locally first (always
 * succeeds) and quality analysis (possibly a network round-trip to a Colab
 * worker) happens afterwards, off the request.
 */
import { updateVideoQuality } from "./repo";
import { getTrainingProvider } from "./provider";
import { logger } from "../logger";

export function enqueueIngest(
  videoId: string,
  input: { filename: string; bytes: number; mime: string; localPath: string },
): void {
  queueMicrotask(async () => {
    try {
      const r = await getTrainingProvider().ingestVideo(input);
      updateVideoQuality(videoId, {
        qualityScore: r.qualityScore,
        qualityStatus: r.qualityStatus,
        meta: r.meta,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error("ingest failed", { videoId, error: msg });
      updateVideoQuality(videoId, {
        qualityScore: null,
        qualityStatus: "INGEST FAILED",
        meta: { error: msg.slice(0, 2000) },
      });
    }
  });
}
