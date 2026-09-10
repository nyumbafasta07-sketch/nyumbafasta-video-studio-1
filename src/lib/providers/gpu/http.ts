/**
 * HTTP GPUProvider — talks to a Python worker (worker/). EXPERIMENTAL: the
 * contract is defined and the worker has a mock implementation, but this path is
 * not covered by the default test run. Worker URL + token come from the runtime
 * config (Settings UI), so it can point at Colab / Kaggle / a local NVIDIA box.
 */
import { getRuntimeConfig } from "../../runtime-config";
import type { GpuArtifact, GpuProvider, GpuTask } from "./types";

export class HttpGpu implements GpuProvider {
  readonly name = "http";

  private cfg() {
    const rc = getRuntimeConfig();
    return { base: rc.gpuWorkerUrl.replace(/\/$/, ""), token: rc.gpuWorkerToken };
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json" };
    const { token } = this.cfg();
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }

  async available(): Promise<boolean> {
    const { base } = this.cfg();
    if (!base) return false;
    try {
      const r = await fetch(`${base}/health`, { headers: this.headers() });
      return r.ok;
    } catch {
      return false;
    }
  }

  async execute(task: GpuTask): Promise<GpuArtifact> {
    const { base } = this.cfg();
    if (!base) throw new Error("GPU worker URL not set (Settings → GPU)");
    const submit = await fetch(`${base}/run`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(task),
    });
    if (!submit.ok) throw new Error(`worker /run ${submit.status}`);
    const { jobId } = (await submit.json()) as { jobId: string };

    for (let i = 0; i < 600; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const s = await fetch(`${base}/jobs/${jobId}`, { headers: this.headers() });
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
        const a = await fetch(`${base}${body.artifactUrl}`, { headers: this.headers() });
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
