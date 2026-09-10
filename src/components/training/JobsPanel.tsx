"use client";

import { useEffect, useState } from "react";
import { TrainingJobProgress } from "./TrainingJobProgress";
import { Icon } from "../Icons";
import { toast } from "../ui/feedback";

const PROFILES = [
  { key: "voice", label: "Voice (L1)" },
  { key: "face_identity", label: "Face Identity (L2)" },
  { key: "speaking_style", label: "Speaking Style (L4)" },
  { key: "face_performance", label: "Face Performance (L5)" },
  { key: "lipsync", label: "Lip-Sync (L5)" },
];

interface Dataset {
  id: string;
  label: string;
  speech_seconds: number;
}
interface Job {
  id: string;
  state: string;
}

export function JobsPanel({ initialProfile }: { initialProfile?: string }) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [profile, setProfile] = useState(initialProfile ?? "voice");
  const [datasetId, setDatasetId] = useState("");
  const [baseModel, setBaseModel] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [d, j] = await Promise.all([
      fetch("/api/training/datasets", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/training/jobs", { cache: "no-store" }).then((r) => r.json()),
    ]);
    setDatasets(d.datasets ?? []);
    setJobs(j.jobs ?? []);
    setDatasetId((cur) => cur || d.datasets?.[0]?.id || "");
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setBusy(true);
    const r = await fetch("/api/training/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile, datasetId, baseModel }),
    });
    setBusy(false);
    if (r.ok) load();
    else {
      const b = await r.json().catch(() => ({}));
      toast(typeof b.error === "string" ? b.error : "Could not start", "err");
    }
  }

  const active = jobs.filter((j) => !["COMPLETED", "FAILED", "CANCELLED"].includes(j.state));
  const recent = jobs.filter((j) => ["COMPLETED", "FAILED", "CANCELLED"].includes(j.state)).slice(0, 5);

  return (
    <>
      <div className="card">
        <h3>Start a training job</h3>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          <div>
            <label htmlFor="tp">Profile</label>
            <select id="tp" value={profile} onChange={(e) => setProfile(e.target.value)}>
              {PROFILES.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="td">Dataset</label>
            <select id="td" value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
              {datasets.length === 0 ? <option value="">(build one first)</option> : null}
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>{d.label} · {Math.round(d.speech_seconds)}s</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tb">Base model (optional)</label>
            <input id="tb" type="text" value={baseModel} onChange={(e) => setBaseModel(e.target.value)} placeholder="e.g. piper/en_US-lessac-medium" />
          </div>
        </div>
        <button onClick={start} disabled={busy || !datasetId} style={{ marginTop: 14 }}>
          <Icon.play /> {busy ? "Starting…" : "Start training"}
        </button>
      </div>

      {active.map((j) => (
        <TrainingJobProgress key={j.id} jobId={j.id} onDone={load} />
      ))}

      {recent.length > 0 ? (
        <div className="card">
          <h3>Recent jobs</h3>
          {recent.map((j) => (
            <TrainingJobProgress key={j.id} jobId={j.id} />
          ))}
        </div>
      ) : null}
    </>
  );
}
