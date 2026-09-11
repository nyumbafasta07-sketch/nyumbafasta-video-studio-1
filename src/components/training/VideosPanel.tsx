"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import { confirmDialog, toast } from "../ui/feedback";

interface Video {
  id: string;
  filename: string;
  bytes: number;
  in_dataset: boolean;
  quality_score: number | null;
  quality_status: string;
  created_at: string;
}

const statusClass = (s: string) =>
  s === "GOOD FOR TRAINING" ? "good" : s === "PENDING" ? "state" : "failed";

export function VideosPanel() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/training/videos", { cache: "no-store" });
    if (r.ok) setVideos((await r.json()).videos);
  }
  useEffect(() => {
    load();
  }, []);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    for (const f of files) {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/training/videos", { method: "POST", body: fd });
      if (!r.ok) toast(`${f.name}: ${(await r.json().catch(() => ({}))).error ?? "failed"}`, "err");
    }
    setBusy(false);
    e.target.value = "";
    load();
  }

  async function toggle(v: Video) {
    await fetch(`/api/training/videos/${v.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inDataset: !v.in_dataset }),
    });
    load();
  }

  async function del(v: Video) {
    if (!(await confirmDialog({ title: `Delete ${v.filename}?`, body: "The raw file is removed too.", confirmText: "Delete", danger: true }))) return;
    await fetch(`/api/training/videos/${v.id}`, { method: "DELETE" });
    load();
  }

  const marked = videos.filter((v) => v.in_dataset).length;

  return (
    <>
      <div className="card">
        <h3>Upload authorized recordings</h3>
        <p className="page-lead">
          Videos you are authorized to use. A video is <b>not</b> training data
          until you tick <b>Add to dataset</b>.
        </p>
        <input type="file" accept="video/*,audio/*" multiple onChange={upload} disabled={busy} />
        {busy ? <span className="muted"> uploading…</span> : null}
        <p className="field-hint">
          Big files upload slowly — shrink first (see <span className="mono">worker/colab/RUN_ON_COLAB.md</span>).
        </p>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>Videos</h3>
          <span className="muted" style={{ fontSize: 12 }}>{marked} marked for training</span>
        </div>
        {videos.length === 0 ? (
          <div className="empty"><Icon.upload /><div>Nothing uploaded yet.</div></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>File</th><th>Size</th><th>Quality</th><th>Status</th><th>In dataset</th><th></th></tr>
              </thead>
              <tbody>
                {videos.map((v) => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 550 }}>{v.filename}</td>
                    <td className="muted">{(v.bytes / 1024 / 1024).toFixed(1)} MB</td>
                    <td>{v.quality_score != null ? `${v.quality_score}/10` : "—"}</td>
                    <td><span className={`badge ${statusClass(v.quality_status)}`}>{v.quality_status}</span></td>
                    <td>
                      <label style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                        <input type="checkbox" checked={v.in_dataset} onChange={() => toggle(v)} />
                        {v.in_dataset ? "yes" : "no"}
                      </label>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button className="icon-btn" onClick={() => del(v)} title="Delete"><Icon.trash /></button>
                    </td>
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
