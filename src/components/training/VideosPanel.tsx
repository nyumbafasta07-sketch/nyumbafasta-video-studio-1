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
  meta: Record<string, unknown>;
  created_at: string;
}

interface UploadItem {
  name: string;
  bytes: number;
  pct: number; // 0-100, -1 = failed
  error?: string;
}

const statusClass = (s: string) =>
  s === "GOOD FOR TRAINING" ? "good" : s === "PENDING" ? "state" : "failed";

/** XHR (not fetch) so we get real upload progress and a distinct network-error
 * signal — needed to tell "still transferring on a slow connection" apart from
 * "the connection was cut" instead of a bare "failed". */
function uploadWithProgress(file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/training/videos");
    xhr.timeout = 20 * 60 * 1000; // 20 min — large files on a slow link
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = `HTTP ${xhr.status}`;
      try {
        const body = JSON.parse(xhr.responseText);
        if (body?.error) msg = typeof body.error === "string" ? body.error : JSON.stringify(body.error);
      } catch {
        /* non-JSON response (e.g. a proxy error page) — keep the status code */
      }
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error("Network error — the connection was interrupted during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out (20 min) — file may be too large for this connection"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}

export function VideosPanel() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/training/videos", { cache: "no-store" });
    if (r.ok) setVideos((await r.json()).videos);
  }
  useEffect(() => {
    load();
  }, []);

  // while anything is still being analyzed in the background, keep polling
  useEffect(() => {
    if (!videos.some((v) => v.quality_status === "PENDING")) return;
    const t = setTimeout(load, 2500);
    return () => clearTimeout(t);
  }, [videos]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    setUploads(files.map((f) => ({ name: f.name, bytes: f.size, pct: 0 })));

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        await uploadWithProgress(f, (pct) => {
          setUploads((cur) => cur.map((u, idx) => (idx === i ? { ...u, pct } : u)));
        });
        setUploads((cur) => cur.map((u, idx) => (idx === i ? { ...u, pct: 100 } : u)));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "upload failed";
        setUploads((cur) => cur.map((u, idx) => (idx === i ? { ...u, pct: -1, error: msg } : u)));
        toast(`${f.name}: ${msg}`, "err");
      }
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
        <p className="field-hint">
          Upload always writes the file locally right away — quality analysis
          (Whisper / face detect, possibly on your GPU worker) runs afterwards
          in the background; the row starts <b>PENDING</b> and updates itself.
          Big files upload slowly on a weak connection — try a small file (a
          few MB) first, or shrink first (see{" "}
          <span className="mono">worker/colab/RUN_ON_COLAB.md</span>).
        </p>

        {uploads.length > 0 ? (
          <div className="stack" style={{ marginTop: 12 }}>
            {uploads.map((u) => (
              <div key={u.name}>
                <div className="between" style={{ fontSize: 12.5 }}>
                  <span>{u.name} <span className="muted">· {(u.bytes / 1024 / 1024).toFixed(1)} MB</span></span>
                  <span className={u.pct === -1 ? "form-error" : "muted"} style={{ margin: 0 }}>
                    {u.pct === -1 ? "failed" : u.pct === 100 ? "done" : `${u.pct}%`}
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 4, background: "var(--panel-2)", overflow: "hidden", marginTop: 4 }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${u.pct === -1 ? 100 : u.pct}%`,
                      background: u.pct === -1 ? "var(--danger)" : "var(--accent)",
                      transition: "width .2s",
                    }}
                  />
                </div>
                {u.error ? <p className="form-error" style={{ fontSize: 12, margin: "4px 0 0" }}>{u.error}</p> : null}
              </div>
            ))}
          </div>
        ) : null}
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
                    <td>
                      <span
                        className={`badge ${statusClass(v.quality_status)}`}
                        title={v.quality_status === "INGEST FAILED" ? String(v.meta.error ?? "") : undefined}
                      >
                        {v.quality_status}
                      </span>
                    </td>
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
