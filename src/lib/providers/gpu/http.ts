/**
 * HTTP GPUProvider — talks to the Python worker (worker/). EXPERIMENTAL: the
 * contract is defined and the worker has a mock implementation, but this path is
 * not exercised by Phase 2 and is not covered by the default test run. Becomes
 * the real cloud/local GPU boundary in Phase 3 (brief §9).
 */
import { config } from "../../config";
import type { GpuArtifact, GpuProvider, GpuTask } from "./types";

export class HttpGpu implements GpuProvider {
  readonly name = "http";
  private base = config.gpuWorker.url.replace(/\/$/, "");
  private token = config.gpuWorker.token;

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (this.token) h.authorization = `Bearer ${this.token}`;
    return h;
  }

  async available(): Promise<boolean> {
    if (!this.base) return false;
    try {
      const r = await fetch(`${this.base}/health`, { headers: this.headers() });
      return r.ok;
    } catch {
      return false;
    }
  }

  async execute(task: GpuTask): Promise<GpuArtifact> {
    if (!this.base) throw new Error("GPU_WORKER_URL not set");
    const submit = await fetch(`${this.base}/run`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(task),
    });
    if (!submit.ok) throw new Error(`worker /run ${submit.status}`);
    const { jobId } = (await submit.json()) as { jobId: string };

    // poll
    for (let i = 0; i < 600; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const s = await fetch(`${this.base}/jobs/${jobId}`, { headers: this.headers() });
      if (!s.ok) throw new Error(`worker /jobs ${s.status}`);
      const body = (await s.json()) as {
        status: string;
        error?: string;
        artifactUrl?: string;
        mime?: string;
        model?: string;
        kind?: GpuArtifact["kind"];
        meta?: Record<string, unknown>;
      };
      if (body.status === "error") throw new Error(body.error ?? "worker error");
      if (body.status === "done") {
        const a = await fetch(`${this.base}${body.artifactUrl}`, {
          headers: this.headers(),
        });
        if (!a.ok) throw new Error(`worker artifact ${a.status}`);
        return {
          data: Buffer.from(await a.arrayBuffer()),
          mime: body.mime ?? "application/octet-stream",
          kind: body.kind ?? "EXPERIMENTAL",
          model: body.model ?? "worker",
          meta: body.meta ?? {},
        };
      }
    }
    throw new Error("worker job timed out");
  }
}
