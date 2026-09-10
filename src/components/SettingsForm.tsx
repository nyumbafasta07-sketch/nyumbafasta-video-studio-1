"use client";

import { useEffect, useState } from "react";

interface Cfg {
  gpuProvider: "local-mock" | "http";
  gpuWorkerUrl: string;
  gpuWorkerTokenSet: boolean;
  trainingProvider: "mock" | "worker";
}
interface Payload {
  config: Cfg;
  ownerLabel: string;
  output: { width: number; height: number; greenHex: string };
  storageDir: string;
  databaseFile: string;
  passwordHashConfigured: boolean;
}

export function SettingsForm() {
  const [p, setP] = useState<Payload | null>(null);
  const [gpuProvider, setGpuProvider] = useState<Cfg["gpuProvider"]>("local-mock");
  const [trainingProvider, setTrainingProvider] = useState<Cfg["trainingProvider"]>("mock");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [owner, setOwner] = useState("");
  const [msg, setMsg] = useState("");
  const [test, setTest] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/settings", { cache: "no-store" });
    if (!r.ok) return;
    const data: Payload = await r.json();
    setP(data);
    setGpuProvider(data.config.gpuProvider);
    setTrainingProvider(data.config.trainingProvider);
    setUrl(data.config.gpuWorkerUrl);
    setOwner(data.ownerLabel);
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    setBusy(true);
    setMsg("");
    const body: Record<string, unknown> = {
      gpuProvider,
      trainingProvider,
      gpuWorkerUrl: url,
      ownerLabel: owner,
    };
    if (token) body.gpuWorkerToken = token;
    const r = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (r.ok) {
      setToken("");
      setMsg("Saved. Takes effect on the next job — no restart needed.");
      load();
    } else {
      const b = await r.json().catch(() => ({}));
      setMsg(typeof b.error === "string" ? b.error : "Could not save.");
    }
  }

  async function testGpu() {
    setTest("testing…");
    const r = await fetch("/api/settings/test-gpu", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, token: token || undefined }),
    });
    const b = await r.json().catch(() => ({}));
    setTest(b.ok ? `OK (${b.status}) ${b.detail ?? ""}` : `FAILED: ${b.detail ?? r.status}`);
  }

  if (!p) return <p className="muted">loading…</p>;

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Compute (GPU)</h3>
        <p className="muted" style={{ fontSize: 13 }}>
          Point the app at any worker running <span className="mono">worker/worker.py</span> —
          Colab tunnel, Kaggle, a local NVIDIA machine, anything. The browser
          never talks to the worker; only this server does.
        </p>

        <label htmlFor="gp">GPU provider (generation: voice / face / lip-sync)</label>
        <select id="gp" value={gpuProvider} onChange={(e) => setGpuProvider(e.target.value as Cfg["gpuProvider"])}>
          <option value="local-mock">local-mock — fake output, no GPU</option>
          <option value="http">http — real worker at the URL below</option>
        </select>

        <label htmlFor="tp">Training provider (Training Studio)</label>
        <select
          id="tp"
          value={trainingProvider}
          onChange={(e) => setTrainingProvider(e.target.value as Cfg["trainingProvider"])}
        >
          <option value="mock">mock — fake training, no GPU</option>
          <option value="worker">worker — real worker at the URL below</option>
        </select>

        <label htmlFor="wu">Worker URL</label>
        <input
          id="wu"
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://xxxx.trycloudflare.com"
        />

        <label htmlFor="wt">
          Worker token {p.config.gpuWorkerTokenSet ? "(one is stored — leave blank to keep it)" : "(optional)"}
        </label>
        <input
          id="wt"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={p.config.gpuWorkerTokenSet ? "•••••• (unchanged)" : "bearer token, if the worker needs one"}
        />

        <div className="row" style={{ marginTop: 12 }}>
          <button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button className="secondary" onClick={testGpu} disabled={!url}>
            Test connection
          </button>
          {test ? <span className="mono" style={{ fontSize: 12 }}>{test}</span> : null}
        </div>
        {msg ? <p className="muted" style={{ fontSize: 13 }}>{msg}</p> : null}
        <p className="muted" style={{ fontSize: 12 }}>
          The token is stored in the local database file (git-ignored), never in
          source, never logged, never sent back to the browser.
        </p>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>General</h3>
        <label htmlFor="ow">Owner label</label>
        <input id="ow" type="text" value={owner} onChange={(e) => setOwner(e.target.value)} />
        <button style={{ marginTop: 12 }} onClick={save} disabled={busy}>
          Save
        </button>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Read-only</h3>
        <table>
          <tbody>
            <tr><th style={{ width: 180 }}>Auth</th><td className="mono">{p.passwordHashConfigured ? "password hash configured" : "NOT configured — logins refused"}</td></tr>
            <tr><th>Output</th><td className="mono">{p.output.width}×{p.output.height} (9:16)</td></tr>
            <tr><th>Green screen</th><td className="mono">{p.output.greenHex}</td></tr>
            <tr><th>Storage dir</th><td className="mono">{p.storageDir}</td></tr>
            <tr><th>Database</th><td className="mono">{p.databaseFile}</td></tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
