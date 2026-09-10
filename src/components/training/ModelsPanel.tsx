"use client";

import { useEffect, useMemo, useState } from "react";

interface Version {
  id: string;
  profile: string;
  label: string;
  version_num: number;
  base_model: string;
  eval_score: number | null;
  eval: { breakdown?: Record<string, number> };
  status: string;
  gpu_used: string;
  notes: string;
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

const STATUS_CLASS: Record<string, string> = {
  experimental: "mock",
  approved: "state",
  production: "production",
  rejected: "failed",
  archived: "",
};

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

  useEffect(() => {
    if (!sel) return setDetail(null);
    fetch(`/api/training/models/${sel}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setDetail);
  }, [sel]);

  async function transition(status: string) {
    if (!sel) return;
    const r = await fetch(`/api/training/models/${sel}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!r.ok) alert((await r.json().catch(() => ({}))).error ?? "failed");
    await load();
    setSel(sel);
    fetch(`/api/training/models/${sel}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setDetail);
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
        <h3 style={{ marginTop: 0 }}>Model versions</h3>
        {versions.length === 0 ? (
          <p className="muted">No versions yet — run a training job.</p>
        ) : (
          Object.entries(byProfile).map(([p, list]) => (
            <div key={p} style={{ marginBottom: 14 }}>
              <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>{p}</div>
              <table>
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Aggregate</th>
                    <th>Status</th>
                    <th>Base</th>
                    <th>Created</th>
                    <th>A/B</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((v) => (
                    <tr key={v.id} style={{ background: sel === v.id ? "var(--panel-2)" : undefined }}>
                      <td>
                        <button
                          className="secondary"
                          style={{ padding: "2px 8px", fontSize: 12 }}
                          onClick={() => setSel(v.id)}
                        >
                          {v.label}
                        </button>
                      </td>
                      <td>{v.eval_score?.toFixed(1) ?? "—"}/10</td>
                      <td><span className={`badge ${STATUS_CLASS[v.status]}`}>{v.status}</span></td>
                      <td className="muted mono">{v.base_model || "—"}</td>
                      <td className="muted">{new Date(v.created_at).toLocaleDateString()}</td>
                      <td>
                        <button
                          className="secondary"
                          style={{ padding: "2px 8px", fontSize: 12 }}
                          onClick={() =>
                            setAb(([x, y]) => (x === v.id ? [y, null] : y === v.id ? [x, null] : x ? [x, v.id] : [v.id, y]))
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
          ))
        )}
      </div>

      {a && b ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>A/B — {a.label} vs {b.label}</h3>
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>{a.label}</th>
                <th>{b.label}</th>
                <th>Δ</th>
              </tr>
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
                    <td style={{ color: bv - av >= 0 ? "var(--accent)" : "var(--danger)" }}>
                      {(bv - av).toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {detail ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>
            {detail.version.label}{" "}
            <span className={`badge ${STATUS_CLASS[detail.version.status]}`}>
              {detail.version.status}
            </span>
          </h3>
          <p className="muted" style={{ fontSize: 13 }}>
            aggregate {detail.version.eval_score?.toFixed(1) ?? "—"}/10 · base{" "}
            <span className="mono">{detail.version.base_model || "—"}</span> · GPU{" "}
            {detail.version.gpu_used}
          </p>

          <div className="row" style={{ marginBottom: 12 }}>
            {detail.allowedTransitions.length === 0 ? (
              <span className="muted">no further transitions</span>
            ) : (
              detail.allowedTransitions.map((t) => (
                <button key={t} onClick={() => transition(t)}>
                  {t === "production"
                    ? "Promote to PRODUCTION"
                    : t === "approved"
                      ? "Approve"
                      : t[0].toUpperCase() + t.slice(1)}
                </button>
              ))
            )}
          </div>
          <p className="muted" style={{ fontSize: 12 }}>
            Training completing ≠ output being good. Promote only after it passes
            the Tanzania bar (§4, §8.5).
          </p>

          <h4>Evaluation outputs (fixed Swahili scripts, §8.5)</h4>
          {detail.evalRuns.length === 0 ? (
            <p className="muted">none</p>
          ) : (
            detail.evalRuns.map((e) => (
              <div key={e.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 10 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <b>{e.test_key}</b>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {Object.entries(e.scores)
                      .map(([k, v]) => `${k} ${v}`)
                      .join(" · ")}
                  </span>
                </div>
                <p className="muted" style={{ fontSize: 13, margin: "4px 0" }}>{e.script_text}</p>
                {e.previewUrl ? (
                  e.previewUrl.endsWith(".png") ? (
                    <img src={e.previewUrl} alt="" style={{ maxWidth: 240, borderRadius: 6 }} />
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
