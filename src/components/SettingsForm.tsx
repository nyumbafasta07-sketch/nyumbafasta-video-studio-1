"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icons";
import { toast } from "./ui/feedback";

type ProfileName = "colab" | "kaggle";
interface Cfg {
  gpuProvider: "local-mock" | "http";
  gpuWorkerUrl: string;
  gpuWorkerTokenSet: boolean;
  trainingProvider: "mock" | "worker";
  activeGpuProfile: ProfileName | "";
  gpuProfiles: Record<ProfileName, { url: string; tokenSet: boolean }>;
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
  const [test, setTest] = useState<{ ok?: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [profileUrl, setProfileUrl] = useState<Record<ProfileName, string>>({ colab: "", kaggle: "" });
  const [profileToken, setProfileToken] = useState<Record<ProfileName, string>>({ colab: "", kaggle: "" });
  const [profileBusy, setProfileBusy] = useState<ProfileName | null>(null);

  async function load() {
    const r = await fetch("/api/settings", { cache: "no-store" });
    if (!r.ok) return;
    const data: Payload = await r.json();
    setP(data);
    setGpuProvider(data.config.gpuProvider);
    setTrainingProvider(data.config.trainingProvider);
    setUrl(data.config.gpuWorkerUrl);
    setOwner(data.ownerLabel);
    setProfileUrl({ colab: data.config.gpuProfiles.colab.url, kaggle: data.config.gpuProfiles.kaggle.url });
  }
  useEffect(() => {
    load();
  }, []);

  async function saveProfile(name: ProfileName) {
    setProfileBusy(name);
    const body: Record<string, unknown> = { name, url: profileUrl[name] };
    if (profileToken[name]) body.token = profileToken[name];
    const r = await fetch("/api/settings/gpu-profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setProfileBusy(null);
    if (r.ok) {
      setProfileToken((t) => ({ ...t, [name]: "" }));
      toast(`${name === "colab" ? "Colab" : "Kaggle"} saved`, "ok");
      load();
    } else {
      const b = await r.json().catch(() => ({}));
      toast(typeof b.error === "string" ? b.error : "Could not save.", "err");
    }
  }

  async function activateProfile(name: ProfileName) {
    setProfileBusy(name);
    const r = await fetch("/api/settings/gpu-profile/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setProfileBusy(null);
    if (r.ok) {
      toast(`${name === "colab" ? "Colab" : "Kaggle"} imewashwa — inatumika sasa`, "ok");
      load();
    } else {
      const b = await r.json().catch(() => ({}));
      toast(typeof b.error === "string" ? b.error : "Could not switch.", "err");
    }
  }

  async function save() {
    setBusy(true);
    const body: Record<string, unknown> = { gpuProvider, trainingProvider, gpuWorkerUrl: url, ownerLabel: owner };
    if (token) body.gpuWorkerToken = token;
    const r = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (r.ok) {
      setToken("");
      toast("Saved — takes effect on the next job", "ok");
      load();
    } else {
      const b = await r.json().catch(() => ({}));
      toast(typeof b.error === "string" ? b.error : "Could not save.", "err");
    }
  }

  async function testGpu() {
    setTest({ msg: "testing…" });
    const r = await fetch("/api/settings/test-gpu", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, token: token || undefined }),
    });
    const b = await r.json().catch(() => ({}));
    setTest(
      b.ok
        ? { ok: true, msg: `OK (${b.status}) ${String(b.detail ?? "").slice(0, 120)}` }
        : { ok: false, msg: `Failed: ${b.detail ?? r.status}` },
    );
  }

  if (!p) return <div className="card"><div className="skeleton" style={{ height: 200 }} /></div>;

  return (
    <>
      <div className="card">
        <h3>Compute profiles</h3>
        <p className="page-lead">
          Save a URL + token for each worker once, then switch the active one with one button —
          handy when Colab hits its free-tier GPU limit and you flip to Kaggle (or back), with no re-pasting.
        </p>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {(["colab", "kaggle"] as ProfileName[]).map((name) => {
            const label = name === "colab" ? "Colab" : "Kaggle";
            const saved = p.config.gpuProfiles[name];
            const isActive = p.config.activeGpuProfile === name;
            return (
              <div key={name} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <strong>{label}</strong>
                  {isActive ? <span className="badge success">inatumika sasa</span> : null}
                </div>
                <label htmlFor={`pu-${name}`} style={{ marginTop: 8 }}>URL</label>
                <input
                  id={`pu-${name}`}
                  type="text"
                  value={profileUrl[name]}
                  onChange={(e) => setProfileUrl((s) => ({ ...s, [name]: e.target.value }))}
                  placeholder="https://xxxx.trycloudflare.com"
                />
                <label htmlFor={`pt-${name}`}>
                  Token {saved.tokenSet ? "· imehifadhiwa, acha wazi kuibaki" : "· hiari"}
                </label>
                <input
                  id={`pt-${name}`}
                  type="password"
                  value={profileToken[name]}
                  onChange={(e) => setProfileToken((s) => ({ ...s, [name]: e.target.value }))}
                  placeholder={saved.tokenSet ? "•••••• (haijabadilika)" : "bearer token"}
                />
                <div className="row" style={{ marginTop: 10, gap: 8 }}>
                  <button className="secondary" onClick={() => saveProfile(name)} disabled={profileBusy === name}>
                    {profileBusy === name ? "…" : "Hifadhi"}
                  </button>
                  <button
                    onClick={() => activateProfile(name)}
                    disabled={profileBusy === name || !saved.url && !profileUrl[name]}
                  >
                    {isActive ? "Washa tena" : `Washa ${label}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h3>Compute (GPU) — active worker</h3>
        <p className="page-lead">
          This is whichever worker is active right now (set via a profile above, or edited directly
          here for a one-off / third worker). The browser never talks to the worker; only this server does.
        </p>

        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label htmlFor="gp">GPU provider — generation</label>
            <select id="gp" value={gpuProvider} onChange={(e) => setGpuProvider(e.target.value as Cfg["gpuProvider"])}>
              <option value="local-mock">local-mock — fake output, no GPU</option>
              <option value="http">http — real worker</option>
            </select>
          </div>
          <div>
            <label htmlFor="tp">Training provider</label>
            <select id="tp" value={trainingProvider} onChange={(e) => setTrainingProvider(e.target.value as Cfg["trainingProvider"])}>
              <option value="mock">mock — fake training, no GPU</option>
              <option value="worker">worker — real worker</option>
            </select>
          </div>
        </div>

        <label htmlFor="wu">Worker URL</label>
        <input id="wu" type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.trycloudflare.com" />

        <label htmlFor="wt">
          Worker token {p.config.gpuWorkerTokenSet ? "· one is stored, leave blank to keep it" : "· optional"}
        </label>
        <input
          id="wt"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={p.config.gpuWorkerTokenSet ? "•••••• (unchanged)" : "bearer token, if the worker needs one"}
        />

        <div className="row" style={{ marginTop: 14 }}>
          <button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          <button className="secondary" onClick={testGpu} disabled={!url}>
            <Icon.spark /> Test connection
          </button>
          {test ? (
            <span className={`badge ${test.ok === true ? "success" : test.ok === false ? "failed" : "plain"}`}>
              {test.msg}
            </span>
          ) : null}
        </div>
        <p className="field-hint">
          The token is stored in the local database file (git-ignored) — never in source, never logged, never sent to the browser.
        </p>
      </div>

      <div className="card">
        <h3>General</h3>
        <label htmlFor="ow">Owner label</label>
        <input id="ow" type="text" value={owner} onChange={(e) => setOwner(e.target.value)} />
        <button style={{ marginTop: 14 }} onClick={save} disabled={busy}>Save</button>
      </div>

      <div className="card">
        <h3>Read-only</h3>
        <div className="table-wrap">
          <table>
            <tbody>
              <tr><th style={{ width: 170 }}>Auth</th><td className="mono">{p.passwordHashConfigured ? "password configured" : "NOT configured — logins refused"}</td></tr>
              <tr><th>Output</th><td className="mono">{p.output.width}×{p.output.height} (9:16)</td></tr>
              <tr><th>Green screen</th><td className="mono">{p.output.greenHex}</td></tr>
              <tr><th>Storage</th><td className="mono">{p.storageDir}</td></tr>
              <tr><th>Database</th><td className="mono">{p.databaseFile}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
