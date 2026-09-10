"use client";

import { useEffect, useRef, useState } from "react";

interface StageView {
  key: string;
  state: string;
  progress: { status: string; attempt: number; error?: string };
}
interface JobView {
  id: string;
  state: string;
  stage: string;
  error: string | null;
  inputs: { width: number; height: number; background: string; emotion: string };
}
interface Payload {
  job: JobView;
  stages: StageView[];
  output: { downloadUrl: string; bytes: number; meta: Record<string, unknown> } | null;
}

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

const LABELS: Record<string, string> = {
  validate_script: "Validate script",
  snapshot_inputs: "Snapshot inputs",
  generate_audio: "Generate voice (mock)",
  generate_face: "Generate avatar (mock)",
  lip_sync: "Lip-sync (mock)",
  render_video: "Render green-screen MP4",
  validate_output: "Validate output",
  store_output: "Store output",
};

export function JobProgress({ jobId }: { jobId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const payload: Payload = await res.json();
        if (!alive) return;
        setData(payload);
        if (!TERMINAL.has(payload.job.state)) {
          timer.current = setTimeout(tick, 1500);
        }
      } catch (e) {
        if (!alive) return;
        setErr(String(e));
        timer.current = setTimeout(tick, 3000);
      }
    }
    tick();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [jobId]);

  if (err && !data) return <p style={{ color: "var(--danger)" }}>Polling error: {err}</p>;
  if (!data) return <p className="muted">Loading job…</p>;

  const { job, stages, output } = data;
  const stateClass =
    job.state === "COMPLETED" ? "completed" : job.state === "FAILED" ? "failed" : "state";

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <span className={`badge ${stateClass}`}>{job.state}</span>{" "}
          <span className="mono muted">{job.id}</span>
        </div>
        <span className="muted">
          {job.inputs.width}×{job.inputs.height} · {job.inputs.emotion} · bg {job.inputs.background}
        </span>
      </div>

      <ul className="stage-list" style={{ marginTop: 14 }}>
        {stages.map((s) => (
          <li key={s.key}>
            <span>
              <span className={`dot ${s.progress.status}`} />
              {LABELS[s.key] ?? s.key}
            </span>
            <span className="muted">
              {s.progress.status}
              {s.progress.attempt > 1 ? ` (try ${s.progress.attempt})` : ""}
              {s.progress.error ? ` — ${s.progress.error}` : ""}
            </span>
          </li>
        ))}
      </ul>

      {job.state === "FAILED" && job.error ? (
        <p style={{ color: "var(--danger)", fontSize: 13 }}>Failed: {job.error}</p>
      ) : null}

      {output ? (
        <div style={{ marginTop: 16 }}>
          <video controls src={output.downloadUrl} />
          <div className="row" style={{ marginTop: 10 }}>
            <a className="btn" href={output.downloadUrl}>Download MP4</a>
            <span className="muted">
              {(output.bytes / 1024 / 1024).toFixed(2)} MB ·{" "}
              {String(output.meta.kind ?? "MOCK")} ·{" "}
              {String(output.meta.provider ?? "")}/{String(output.meta.model ?? "")} ·{" "}
              {output.meta.durationSeconds ? `${Number(output.meta.durationSeconds).toFixed(1)}s` : ""}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
