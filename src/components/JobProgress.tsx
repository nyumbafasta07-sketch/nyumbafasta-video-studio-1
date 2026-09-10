"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";

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
  generate_audio: "Generate voice",
  generate_face: "Generate avatar",
  lip_sync: "Lip-sync",
  render_video: "Render green-screen MP4",
  validate_output: "Validate output",
  store_output: "Store output",
};

export function JobProgress({ jobId }: { jobId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState("");
  const [acting, setActing] = useState(false);
  const [pollNonce, setPollNonce] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function act(kind: "cancel" | "retry") {
    setActing(true);
    await fetch(`/api/jobs/${jobId}/${kind}`, { method: "POST" }).catch(() => {});
    setActing(false);
    setPollNonce((n) => n + 1);
  }

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const payload: Payload = await res.json();
        if (!alive) return;
        setData(payload);
        if (!TERMINAL.has(payload.job.state)) timer.current = setTimeout(tick, 1500);
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
  }, [jobId, pollNonce]);

  if (err && !data) return <div className="card"><p className="form-error">Polling error: {err}</p></div>;
  if (!data) return <div className="card"><div className="skeleton" style={{ height: 120 }} /></div>;

  const { job, stages, output } = data;
  const stateClass =
    job.state === "COMPLETED" ? "completed" : job.state === "FAILED" ? "failed" : "state";
  const doneCount = stages.filter((s) => s.progress.status === "done").length;

  return (
    <div className="card">
      <div className="between">
        <div className="row">
          <span className={`badge ${stateClass}`}>{job.state}</span>
          <span className="mono muted">{job.id.slice(0, 16)}…</span>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          {job.inputs.width}×{job.inputs.height} · {job.inputs.emotion} · {doneCount}/{stages.length}
        </span>
      </div>

      <ul className="stage-list" style={{ marginTop: 14 }}>
        {stages.map((s) => (
          <li key={s.key}>
            <span className="name">
              <span className={`dot ${s.progress.status}`} />
              {LABELS[s.key] ?? s.key}
            </span>
            <span className="muted" style={{ fontSize: 12 }}>
              {s.progress.status}
              {s.progress.attempt > 1 ? ` · try ${s.progress.attempt}` : ""}
              {s.progress.error ? ` — ${s.progress.error}` : ""}
            </span>
          </li>
        ))}
      </ul>

      {job.state === "FAILED" && job.error ? <p className="form-error">Failed: {job.error}</p> : null}

      <div className="row" style={{ marginTop: 12 }}>
        {!TERMINAL.has(job.state) ? (
          <button className="secondary" disabled={acting} onClick={() => act("cancel")}>
            {acting ? "…" : "Cancel"}
          </button>
        ) : null}
        {(job.state === "FAILED" || job.state === "CANCELLED") ? (
          <button className="secondary" disabled={acting} onClick={() => act("retry")}>
            <Icon.refresh /> {acting ? "…" : "Retry"}
          </button>
        ) : null}
      </div>

      {output ? (
        <div style={{ marginTop: 16 }}>
          <video controls src={output.downloadUrl} />
          <div className="between" style={{ marginTop: 10 }}>
            <a className="btn" href={output.downloadUrl}>
              <Icon.download /> Download MP4
            </a>
            <span className="muted" style={{ fontSize: 12 }}>
              {(output.bytes / 1024 / 1024).toFixed(2)} MB ·{" "}
              {String(output.meta.kind ?? "MOCK")} ·{" "}
              {String(output.meta.provider ?? "")}/{String(output.meta.model ?? "")}
              {output.meta.durationSeconds ? ` · ${Number(output.meta.durationSeconds).toFixed(1)}s` : ""}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
