"use client";

import { useEffect, useState } from "react";

interface Video {
  id: string;
  filename: string;
  bytes: number;
  in_dataset: boolean;
  quality_score: number | null;
  quality_status: string;
  meta: Record<string, unknown>;
  created_at: string;
}

function statusClass(s: string) {
  return s === "GOOD FOR TRAINING" ? "production" : s === "PENDING" ? "state" : "mock";
}

export function VideosPanel() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

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
    setErr("");
    for (const f of files) {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/training/videos", { method: "POST", body: fd });
      if (!r.ok) setErr(`${f.name}: ${(await r.json().catch(() => ({}))).error ?? "failed"}`);
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
    if (!confirm(`Delete ${v.filename}? The raw file is removed too.`)) return;
    await fetch(`/api/training/videos/${v.id}`, { method: "DELETE" });
    load();
  }

  const marked = videos.filter((v) => v.in_dataset).length;

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Upload authorized recordings</h3>
        <p className="muted" style={{ fontSize: 13 }}>
          Videos you are authorized to use. A video is <b>not</b> training data
          until you tick <b>Add to dataset</b> (§8.2). Large files: uploading big
          video over a weak connection is slow — see{" "}
          <span className="mono">worker/colab/RUN_ON_COLAB.md</span> for shrinking tips.
        </p>
        <input type="file" accept="video/*,audio/*" multiple onChange={upload} disabled={busy} />
        {busy ? <span className="muted"> uploading…</span> : null}
        {err ? <p style={{ color: "var(--danger)", fontSize: 13 }}>{err}</p> : null}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>
          Videos <span className="muted">· {marked} marked for training</span>
        </h3>
        {videos.length === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Size</th>
                <th>Quality</th>
                <th>Status</th>
                <th>In dataset</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v) => (
                <tr key={v.id}>
                  <td>{v.filename}</td>
                  <td className="muted">{(v.bytes / 1024 / 1024).toFixed(1)} MB</td>
                  <td>{v.quality_score != null ? `${v.quality_score}/10` : "—"}</td>
                  <td>
                    <span className={`badge ${statusClass(v.quality_status)}`}>
                      {v.quality_status}
                    </span>
                  </td>
                  <td>
                    <label style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={v.in_dataset}
                        onChange={() => toggle(v)}
                        style={{ width: "auto" }}
                      />
                      {v.in_dataset ? "yes" : "no"}
                    </label>
                  </td>
                  <td>
                    <button
                      className="secondary"
                      style={{ padding: "4px 10px", fontSize: 12 }}
                      onClick={() => del(v)}
                    >
                      delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
