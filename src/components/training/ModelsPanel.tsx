"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "../ui/feedback";

interface Version {
  id: string;
  profile: string;
  label: string;
  base_model: string;
  eval_score: number | null;
  eval: { breakdown?: Record<string, number> };
  status: string;
  gpu_used: string;
  created_at: string;
}
interface EvalRun {
  id: string;
  test_key: string;
  script_text: string;
  scores: Record<string, number>;
  previewUrl: string | null;
}
interface Detail {
  version: Version;
  evalRuns: EvalRun[];
  allowedTransitions: string[];
}

export function ModelsPanel({ initialVersionId }: { initialVersionId?: string }) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [sel, setSel] = useState<string | null>(initialVersionId ?? null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [ab, setAb] = useState<[string | null, string | null]>([null, null]);

  async function load() {
    const r = await fetch("/api/training/models", { cache: "no-store" });
    if (r.ok) setVersions((await r.json()).versions);
  }
  useEffect(() => {
    load();
  }, []);

  function loadDetail(id: string | null) {
    if (!id) return setDetail(null);
    fetch(`/api/training/models/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setDetail);
  }
  useEffect(() => {
    loadDetail(sel);
  }, [sel]);

  async function transition(status: string) {
    if (!sel) return;
    const r = await fetch(`/api/training/models/${sel}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!r.ok) toast((await r.json().catch(() => ({}))).error ?? "failed", "err");
    else toast(`Moved to ${status}`, "ok");
    await load();
    loadDetail(sel);
  }

  const byProfile = useMemo(() => {
    const m: Record<string, Version[]> = {};
    for (const v of versions) (m[v.profile] ??= []).push(v);
    return m;
  }, [versions]);

  const [a, b] = ab.map((id) => versions.find((v) => v.id === id) ?? null);
  const abKeys =
    a && b
      ? Array.from(new Set([...Object.keys(a.eval.breakdown ?? {}), ...Object.keys(b.eval.breakdown ?? {})]))
      : [];

  return (
    <>
      <div className="card">
        <h3>Model versions</h3>
        {versions.length === 0 ? (
          <div className="empty"><div>No versions yet — run a training job.</div></div>
        ) : (
          Object.entries(byProfile).map(([p, list]) => (
            <div key={p} style={{ marginBottom: 16 }}>
              <h4 style={{ marginBottom: 6 }}>{p}</h4>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Version</th><th>Aggregate</th><th>Status</th><th>Base</th><th>Created</th><th>A/B</th></tr>
                  </thead>
                  <tbody>
                    {list.map((v) => (
                      <tr key={v.id} style={{ background: sel === v.id ? "var(--panel-2)" : undefined }}>
                        <td>
                          <button className="ghost sm" onClick={() => setSel(v.id)}>{v.label}</button>
                        </td>
                        <td>{v.eval_score?.toFixed(1) ?? "—"}/10</td>
                        <td><span className={`badge ${v.status}`}>{v.status}</span></td>
                        <td className="muted mono">{v.base_model || "—"}</td>
                        <td className="muted">{new Date(v.created_at).toLocaleDateString()}</td>
                        <td>
                          <button
                            className="ghost sm"
                            onClick={() =>
                              setAb(([x, y]) =>
                                x === v.id ? [y, null] : y === v.id ? [x, null] : x ? [x, v.id] : [v.id, y],
                              )
                            }
                          >
                            {ab[0] === v.id ? "A ✓" : ab[1] === v.id ? "B ✓" : "pick"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>

      {a && b ? (
        <div className="card">
          <h3>A/B — {a.label} vs {b.label}</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Metric</th><th>{a.label}</th><th>{b.label}</th><th>Δ</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>aggregate</b></td>
                  <td>{a.eval_score?.toFixed(1)}</td>
                  <td>{b.eval_score?.toFixed(1)}</td>
                  <td>{((b.eval_score ?? 0) - (a.eval_score ?? 0)).toFixed(1)}</td>
                </tr>
                {abKeys.map((k) => {
                  const av = a.eval.breakdown?.[k] ?? 0;
                  const bv = b.eval.breakdown?.[k] ?? 0;
                  return (
                    <tr key={k}>
                      <td>{k}</td>
                      <td>{av.toFixed(1)}</td>
                      <td>{bv.toFixed(1)}</td>
                      <td style={{ color: bv - av >= 0 ? "var(--success)" : "var(--danger)" }}>{(bv - av).toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {detail ? (
        <div className="card">
          <div className="card-h">
            <h3>{detail.version.label}</h3>
            <span className={`badge ${detail.version.status}`}>{detail.version.status}</span>
          </div>
          <p className="page-lead">
            aggregate {detail.version.eval_score?.toFixed(1) ?? "—"}/10 · base{" "}
            <span className="mono">{detail.version.base_model || "—"}</span> · GPU {detail.version.gpu_used}
          </p>

          <div className="row">
            {detail.allowedTransitions.length === 0 ? (
              <span className="muted">no further transitions</span>
            ) : (
              detail.allowedTransitions.map((t) => (
                <button key={t} className={t === "production" ? "" : "secondary"} onClick={() => transition(t)}>
                  {t === "production" ? "Promote to PRODUCTION" : t === "approved" ? "Approve" : t[0].toUpperCase() + t.slice(1)}
                </button>
              ))
            )}
          </div>
          <p className="field-hint">
            Training completing ≠ output being good. Promote only after it passes the Tanzania bar (§4).
          </p>

          <hr className="hr" />
          <h4>Evaluation outputs — fixed Swahili scripts</h4>
          {detail.evalRuns.length === 0 ? (
            <p className="muted">none</p>
          ) : (
            detail.evalRuns.map((e) => (
              <div key={e.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 12 }}>
                <div className="between">
                  <b>{e.test_key}</b>
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    {Object.entries(e.scores).map(([k, v]) => `${k} ${v}`).join(" · ")}
                  </span>
                </div>
                <p className="muted" style={{ fontSize: 13, margin: "6px 0" }}>{e.script_text}</p>
                {e.previewUrl ? (
                  e.previewUrl.endsWith(".png") ? (
                    <img src={e.previewUrl} alt="" style={{ maxWidth: 260, borderRadius: 8 }} />
                  ) : e.previewUrl.endsWith(".mp4") ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video controls src={e.previewUrl} style={{ maxWidth: 320 }} />
                  ) : (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <audio controls src={e.previewUrl} />
                  )
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}
    </>
  );
}
