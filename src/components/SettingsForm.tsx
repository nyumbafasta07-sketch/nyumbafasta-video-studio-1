"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icons";
import { toast } from "./ui/feedback";

interface GpuProfileView {
  id: string;
  label: string;
  url: string;
  tokenSet: boolean;
}
interface Cfg {
  gpuProvider: "local-mock" | "http";
  gpuWorkerUrl: string;
  gpuWorkerTokenSet: boolean;
  trainingProvider: "mock" | "worker";
  activeGpuProfileId: string;
  gpuProfiles: GpuProfileView[];
}
interface Payload {
  config: Cfg;
  ownerLabel: string;
  output: { width: number; height: number; greenHex: string };
  storageDir: string;
  databaseFile: string;
  passwordHashConfigured: boolean;
}

interface Draft {
  label: string;
  url: string;
  token: string;
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
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [newIds, setNewIds] = useState<string[]>([]);
  const [profileBusy, setProfileBusy] = useState<string | null>(null);
  const [profileTest, setProfileTest] = useState<Record<string, { ok?: boolean; msg: string }>>({});

  async function load() {
    const r = await fetch("/api/settings", { cache: "no-store" });
    if (!r.ok) return;
    const data: Payload = await r.json();
    setP(data);
    setGpuProvider(data.config.gpuProvider);
    setTrainingProvider(data.config.trainingProvider);
    setUrl(data.config.gpuWorkerUrl);
    setOwner(data.ownerLabel);
    setDrafts((prev) => {
      const next: Record<string, Draft> = {};
      for (const prof of data.config.gpuProfiles) {
        next[prof.id] = { label: prof.label, url: prof.url, token: "" };
      }
      // keep any not-yet-saved drafts the user is still typing into
      for (const id of newIds) if (prev[id]) next[id] = prev[id];
      return next;
    });
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addProfile() {
    const id = `new-${Date.now()}`;
    setNewIds((ids) => [...ids, id]);
    setDrafts((d) => ({ ...d, [id]: { label: "", url: "", token: "" } }));
  }

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  async function saveProfile(id: string) {
    const draft = drafts[id];
    if (!draft || !draft.label.trim()) {
      toast("Jina la muunganiko linahitajika", "err");
      return;
    }
    setProfileBusy(id);
    const isNew = newIds.includes(id);
    const body: Record<string, unknown> = { label: draft.label, url: draft.url };
    if (!isNew) body.id = id;
    if (draft.token) body.token = draft.token;
    const r = await fetch("/api/settings/gpu-profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setProfileBusy(null);
    if (r.ok) {
      if (isNew) setNewIds((ids) => ids.filter((x) => x !== id));
      toast(`${draft.label} imehifadhiwa`, "ok");
      load();
    } else {
      const b = await r.json().catch(() => ({}));
      toast(typeof b.error === "string" ? b.error : "Could not save.", "err");
    }
  }

  async function deleteProfile(id: string) {
    if (newIds.includes(id)) {
      setNewIds((ids) => ids.filter((x) => x !== id));
      setDrafts((d) => {
        const next = { ...d };
        delete next[id];
        return next;
      });
      return;
    }
    setProfileBusy(id);
    const r = await fetch("/api/settings/gpu-profile", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setProfileBusy(null);
    if (r.ok) {
      toast("Imefutwa", "ok");
      load();
    } else {
      const b = await r.json().catch(() => ({}));
      toast(typeof b.error === "string" ? b.error : "Could not delete.", "err");
    }
  }

  async function testProfile(id: string) {
    const draft = drafts[id];
    if (!draft || !p) return;
    setProfileBusy(id);
    const isNew = newIds.includes(id);
    const saved = p.config.gpuProfiles.find((prof) => prof.id === id);
    const urlChanged = !isNew && !!saved && draft.url !== saved.url;
    // unedited + no fresh token typed -> test with the stored token server-side
    // (the token field is blank on load even for a saved profile, by design)
    const body: Record<string, unknown> =
      !isNew && !urlChanged && !draft.token
        ? { profileId: id }
        : { url: draft.url, token: draft.token || undefined };
    const r = await fetch("/api/settings/test-gpu", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const b = await r.json().catch(() => ({}));
    setProfileBusy(null);
    setProfileTest((t) => ({
      ...t,
      [id]: b.ok
        ? { ok: true, msg: `OK (${b.status}) ${String(b.detail ?? "").slice(0, 100)}` }
        : { ok: false, msg: `Failed: ${b.detail ?? r.status}` },
    }));
  }

  async function activateProfile(id: string) {
    setProfileBusy(id);
    const r = await fetch("/api/settings/gpu-profile/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setProfileBusy(null);
    if (r.ok) {
      toast(`${drafts[id]?.label ?? "GPU"} imewashwa — inatumika sasa`, "ok");
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

  const savedProfiles = p.config.gpuProfiles.map((prof) => prof.id);
  const allIds = [...savedProfiles, ...newIds];

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h3>Compute profiles</h3>
          <button className="secondary sm" onClick={addProfile}>
            <Icon.plus /> Ongeza muunganiko
          </button>
        </div>
        <p className="page-lead">
          Ongeza muunganiko wowote wa GPU kwa jina lako mwenyewe (Colab, RunPod, kompyuta yako
          mwenyewe, chochote) — hifadhi URL + token mara moja, kisha "Washa" ile unayotaka kutumia
          sasa, bila kuandika tena. App haijali "aina" ya GPU — inahitaji tu inayozungumza
          worker/contract.md juu ya HTTP.
        </p>
        {allIds.length === 0 ? (
          <p className="field-hint">Hakuna muunganiko bado — bonyeza &quot;Ongeza muunganiko&quot; kuanza.</p>
        ) : null}
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {allIds.map((id) => {
            const draft = drafts[id];
            if (!draft) return null;
            const isNew = newIds.includes(id);
            const saved = p.config.gpuProfiles.find((prof) => prof.id === id);
            const isActive = p.config.activeGpuProfileId === id;
            return (
              <div key={id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <input
                    type="text"
                    value={draft.label}
                    onChange={(e) => updateDraft(id, { label: e.target.value })}
                    placeholder="jina, mfano: Colab"
                    style={{ fontWeight: 650, flex: 1 }}
                  />
                  {isActive ? <span className="badge success">inatumika sasa</span> : null}
                </div>
                <label htmlFor={`pu-${id}`} style={{ marginTop: 8 }}>URL</label>
                <input
                  id={`pu-${id}`}
                  type="text"
                  value={draft.url}
                  onChange={(e) => updateDraft(id, { url: e.target.value })}
                  placeholder="https://xxxx.trycloudflare.com"
                />
                <label htmlFor={`pt-${id}`}>
                  Token {saved?.tokenSet ? "· imehifadhiwa, acha wazi kuibaki" : "· hiari"}
                </label>
                <input
                  id={`pt-${id}`}
                  type="password"
                  value={draft.token}
                  onChange={(e) => updateDraft(id, { token: e.target.value })}
                  placeholder={saved?.tokenSet ? "•••••• (haijabadilika)" : "bearer token"}
                />
                <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
                  <button className="secondary" onClick={() => saveProfile(id)} disabled={profileBusy === id}>
                    {profileBusy === id ? "…" : "Hifadhi"}
                  </button>
                  <button
                    className="secondary"
                    onClick={() => testProfile(id)}
                    disabled={profileBusy === id || (!draft.url && !saved?.url)}
                  >
                    <Icon.spark /> Jaribu
                  </button>
                  <button
                    onClick={() => activateProfile(id)}
                    disabled={profileBusy === id || isNew || !saved?.url}
                  >
                    {isActive ? "Washa tena" : "Washa"}
                  </button>
                  <button
                    className="secondary sm"
                    onClick={() => deleteProfile(id)}
                    disabled={profileBusy === id}
                    aria-label="Futa"
                  >
                    <Icon.trash />
                  </button>
                </div>
                {profileTest[id] ? (
                  <p style={{ marginTop: 8, marginBottom: 0 }}>
                    <span className={`badge ${profileTest[id].ok === true ? "success" : profileTest[id].ok === false ? "failed" : "plain"}`}>
                      {profileTest[id].msg}
                    </span>
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h3>Compute (GPU) — active worker</h3>
        <p className="page-lead">
          This is whichever worker is active right now (set via a profile above, or edited directly
          here for a one-off worker). The browser never talks to the worker; only this server does.
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
