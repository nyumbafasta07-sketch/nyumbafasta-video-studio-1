"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import { toast } from "../ui/feedback";

interface Dataset {
  id: string;
  label: string;
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

  async function load() {
    const r = await fetch("/api/training/datasets", { cache: "no-store" });
    if (r.ok) setRows((await r.json()).datasets);
  }
  useEffect(() => {
    load();
  }, []);

  async function build() {
    setBusy(true);
    const r = await fetch("/api/training/datasets", { method: "POST" });
    setBusy(false);
    if (r.ok) {
      toast("Dataset built", "ok");
      load();
    } else {
      toast((await r.json().catch(() => ({}))).error ?? "failed", "err");
    }
  }

  return (
    <>
      <div className="card">
        <h3>Build a dataset version</h3>
        <p className="page-lead">
          Snapshots every video marked <b>Add to dataset</b> into a new immutable
          version. Keep old versions to tell whether more data helped.
        </p>
        <button onClick={build} disabled={busy}>
          <Icon.layers /> {busy ? "Building…" : "Build dataset from marked videos"}
        </button>
      </div>

      <div className="card">
        <h3>Dataset versions</h3>
        {rows.length === 0 ? (
          <div className="empty"><Icon.layers /><div>No datasets yet.</div></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Version</th><th>Videos</th><th>Clips</th><th>Speech</th><th>Frames</th><th>Face OK</th><th>Created</th></tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 550 }}>{d.label}</td>
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
          </div>
        )}
      </div>
    </>
  );
}
