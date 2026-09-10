"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const LABELS: Record<string, string> = {
  preprocessing: "Preprocess",
  transcribing: "Transcribe",
  building_dataset: "Build dataset",
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
    base_model: string;
    error: string | null;
    result_version_id: string | null;
  };
  stages: Stage[];
  version: { id: string; label: string; eval_score: number | null } | null;
}

export function TrainingJobProgress({ jobId, onDone }: { jobId: string; onDone?: () => void }) {
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

  if (!data) return <p className="muted">loading job…</p>;
  const { job, stages, version } = data;
  const cls = job.state === "COMPLETED" ? "completed" : job.state === "FAILED" ? "failed" : "state";

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <span className={`badge ${cls}`}>{job.state}</span>{" "}
          <b>{job.profile}</b> <span className="muted">L{job.level}</span>{" "}
          <span className="mono muted">{job.id}</span>
        </div>
        {!TERMINAL.has(job.state) ? (
          <button
            className="secondary"
            disabled={acting}
            onClick={async () => {
              setActing(true);
              await fetch(`/api/training/jobs/${jobId}/cancel`, { method: "POST" }).catch(() => {});
              setActing(false);
            }}
          >
            Cancel
          </button>
        ) : null}
      </div>

      <ul className="stage-list" style={{ marginTop: 12 }}>
        {stages.map((s) => (
          <li key={s.key}>
            <span>
              <span className={`dot ${s.progress.status}`} />
              {LABELS[s.key] ?? s.key}
            </span>
            <span className="muted">
              {s.progress.status}
              {s.progress.error ? ` — ${s.progress.error}` : ""}
            </span>
          </li>
        ))}
      </ul>

      {job.state === "FAILED" && job.error ? (
        <p style={{ color: "var(--danger)", fontSize: 13 }}>Failed: {job.error}</p>
      ) : null}

      {version ? (
        <p style={{ marginBottom: 0 }}>
          Created{" "}
          <Link href={`/training/models?v=${version.id}`}>
            <b>{version.label}</b>
          </Link>{" "}
          — aggregate {version.eval_score?.toFixed(1) ?? "—"}/10 ·{" "}
          <span className="badge mock">EXPERIMENTAL</span> until you approve it.
        </p>
      ) : null}
    </div>
  );
}
