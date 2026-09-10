"use client";

import { useEffect, useState } from "react";

interface Dataset {
  id: string;
  label: string;
  version_num: number;
  video_ids: string[];
  clip_count: number;
  speech_seconds: number;
  frame_count: number;
  face_ok_ratio: number;
  created_at: string;
}

export function DatasetsPanel() {
  const [rows, setRows] = useState<Dataset[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    const r = await fetch("/api/training/datasets", { cache: "no-store" });
    if (r.ok) setRows((await r.json()).datasets);
  }
  useEffect(() => {
    load();
  }, []);

  async function build() {
    setBusy(true);
    setErr("");
    const r = await fetch("/api/training/datasets", { method: "POST" });
    setBusy(false);
    if (r.ok) load();
    else setErr((await r.json().catch(() => ({}))).error ?? "failed");
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Build a dataset version</h3>
        <p className="muted" style={{ fontSize: 13 }}>
          Snapshots every video currently marked <b>Add to dataset</b> into a new,
          immutable version. Keep old versions so you can tell whether more data
          helped or hurt (§8.6).
        </p>
        {err ? <p style={{ color: "var(--danger)", fontSize: 13 }}>{err}</p> : null}
        <button onClick={build} disabled={busy}>
          {busy ? "Building…" : "Build dataset from marked videos"}
        </button>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Dataset versions</h3>
        {rows.length === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Version</th>
                <th>Videos</th>
                <th>Clips</th>
                <th>Speech</th>
                <th>Frames</th>
                <th>Face OK</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td><b>{d.label}</b></td>
                  <td className="muted">{d.video_ids.length}</td>
                  <td className="muted">{d.clip_count}</td>
                  <td className="muted">{Math.round(d.speech_seconds)}s</td>
                  <td className="muted">{d.frame_count}</td>
                  <td className="muted">{Math.round(d.face_ok_ratio * 100)}%</td>
                  <td className="muted">{new Date(d.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
