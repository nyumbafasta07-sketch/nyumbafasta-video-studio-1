"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const LABELS: Record<string, string> = {
  preprocessing: "Preprocess",
  transcribing: "Transcribe",
  building_dataset: "Build dataset",
  extracting_frames: "Extract frames",
  building_profile: "Build profile",
  extracting_driving_clip: "Driving clip",
  training: "Train",
  evaluating: "Evaluate",
};

interface Stage {
  key: string;
  progress: { status: string; error?: string };
}
interface Payload {
  job: {
    id: string;
    profile: string;
    level: number;
    state: string;
    error: string | null;
    result_version_id: string | null;
  };
  stages: Stage[];
  version: { id: string; label: string; eval_score: number | null } | null;
}

export function TrainingJobProgress({
  jobId,
  onDone,
  onDeleted,
}: {
  jobId: string;
  onDone?: () => void;
  onDeleted?: () => void;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [acting, setActing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const r = await fetch(`/api/training/jobs/${jobId}`, { cache: "no-store" });
        if (!r.ok) throw new Error();
        const p: Payload = await r.json();
        if (!alive) return;
        setData(p);
        if (!TERMINAL.has(p.job.state)) timer.current = setTimeout(tick, 1500);
        else if (!doneRef.current) {
          doneRef.current = true;
          onDone?.();
        }
      } catch {
        if (alive) timer.current = setTimeout(tick, 3000);
      }
    }
    tick();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [jobId, onDone]);

  if (!data) return <div className="card"><div className="skeleton" style={{ height: 110 }} /></div>;
  const { job, stages, version } = data;
  const cls = job.state === "COMPLETED" ? "completed" : job.state === "FAILED" ? "failed" : "state";

  return (
    <div className="card">
      <div className="between">
        <div className="row">
          <span className={`badge ${cls}`}>{job.state}</span>
          <b>{job.profile}</b>
          <span className="muted">L{job.level}</span>
          <span className="mono muted">{job.id.slice(0, 14)}…</span>
        </div>
        {!TERMINAL.has(job.state) ? (
          <button
            className="secondary sm"
            disabled={acting}
            onClick={async () => {
              setActing(true);
              await fetch(`/api/training/jobs/${jobId}/cancel`, { method: "POST" }).catch(() => {});
              setActing(false);
            }}
          >
            Cancel
          </button>
        ) : onDeleted ? (
          <button
            className="secondary sm"
            disabled={acting}
            onClick={async () => {
              setActing(true);
              const r = await fetch(`/api/training/jobs/${jobId}`, { method: "DELETE" }).catch(() => null);
              setActing(false);
              if (r?.ok) onDeleted();
            }}
          >
            Futa
          </button>
        ) : null}
      </div>

      <ul className="stage-list" style={{ marginTop: 12 }}>
        {stages.map((s) => (
          <li key={s.key}>
            <span className="name">
              <span className={`dot ${s.progress.status}`} />
              {LABELS[s.key] ?? s.key}
            </span>
            <span className="muted" style={{ fontSize: 12 }}>
              {s.progress.status}
              {s.progress.error ? ` — ${s.progress.error}` : ""}
            </span>
          </li>
        ))}
      </ul>

      {job.state === "FAILED" && job.error ? <p className="form-error">Failed: {job.error}</p> : null}

      {version ? (
        <p style={{ marginBottom: 0, marginTop: 12 }}>
          Created <Link href={`/training/models?v=${version.id}`}><b>{version.label}</b></Link> —
          aggregate {version.eval_score?.toFixed(1) ?? "—"}/10 ·{" "}
          <span className="badge experimental">experimental</span> until you approve it.
        </p>
      ) : null}
    </div>
  );
}
