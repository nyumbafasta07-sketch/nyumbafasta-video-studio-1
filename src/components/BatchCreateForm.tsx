"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "./Icons";
import { toast } from "./ui/feedback";

interface Opt {
  id: string;
  label: string;
  status: string;
}
interface ScriptEntry {
  name: string;
  scriptText: string;
}
interface CreatedJob {
  projectId: string;
  jobId: string;
  name: string;
}

const EMOTIONS = ["Neutral", "Friendly", "Excited", "Serious", "Professional", "Storytelling"];

function emptyEntry(n: number): ScriptEntry {
  return { name: `Video ${n}`, scriptText: "" };
}

export function BatchCreateForm({ voices, avatars }: { voices: Opt[]; avatars: Opt[] }) {
  const [entries, setEntries] = useState<ScriptEntry[]>([emptyEntry(1)]);
  const [voiceId, setVoiceId] = useState(voices[0]?.id ?? "");
  const [avatarId, setAvatarId] = useState(avatars[0]?.id ?? "");
  const [emotion, setEmotion] = useState("Neutral");
  const [busy, setBusy] = useState(false);
  const [filesBusy, setFilesBusy] = useState(false);
  const [created, setCreated] = useState<CreatedJob[] | null>(null);

  function addEntry() {
    setEntries((es) => [...es, emptyEntry(es.length + 1)]);
  }
  function removeEntry(i: number) {
    setEntries((es) => es.filter((_, idx) => idx !== i));
  }
  function updateEntry(i: number, patch: Partial<ScriptEntry>) {
    setEntries((es) => es.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }

  async function addFromFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setFilesBusy(true);
    const next: ScriptEntry[] = [];
    for (const file of Array.from(fileList)) {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/script/extract", { method: "POST", body: fd });
      if (r.ok) {
        const { text } = await r.json();
        next.push({ name: file.name.replace(/\.[^.]+$/, ""), scriptText: (text ?? "").trim() });
      } else {
        toast(`Could not read ${file.name}`, "err");
      }
    }
    setFilesBusy(false);
    if (next.length === 0) return;
    setEntries((es) => {
      const base = es.length === 1 && !es[0].scriptText.trim() ? [] : es; // drop the lone placeholder
      return [...base, ...next];
    });
  }

  async function submit() {
    const scripts = entries
      .map((e) => ({ name: e.name.trim() || "Video", scriptText: e.scriptText.trim() }))
      .filter((e) => e.scriptText.length > 0);
    if (scripts.length === 0) {
      toast("Ongeza script angalau moja yenye maandiko", "err");
      return;
    }
    setBusy(true);
    const r = await fetch("/api/projects/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scripts, voiceId, avatarId, emotion }),
    });
    setBusy(false);
    if (r.ok) {
      const { created } = await r.json();
      setCreated(created);
      toast(`Video ${created.length} zimewekwa kwenye foleni`, "ok");
    } else {
      const b = await r.json().catch(() => ({}));
      toast(typeof b.error === "string" ? b.error : "Could not start batch.", "err");
    }
  }

  if (created) {
    return (
      <div className="card">
        <h3>Foleni imeanzishwa — {created.length} video</h3>
        <p className="page-lead">
          Zinazalishwa moja baada ya nyingine (si kwa pamoja) — GPU moja tu, foleni salama.
          Unaweza kufunga ukurasa huu; zitaendelea nyuma.
        </p>
        <ul className="stage-list">
          {created.map((c) => (
            <li key={c.jobId}>
              <span className="name">{c.name}</span>
              <Link href={`/projects/${c.projectId}`}>Fungua →</Link>
            </li>
          ))}
        </ul>
        <button className="secondary" style={{ marginTop: 14 }} onClick={() => { setCreated(null); setEntries([emptyEntry(1)]); }}>
          Anzisha foleni nyingine
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <h3>Mipangilio ya foleni nzima</h3>
        <p className="page-lead">
          Sauti, uso na hisia hizi zitatumika kwa video ZOTE kwenye foleni hii.
        </p>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          <div>
            <label htmlFor="bv">Sauti</label>
            <select id="bv" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
              {voices.length === 0 ? <option value="">(hakuna)</option> : null}
              {voices.map((v) => (
                <option key={v.id} value={v.id}>{v.label} · {v.status}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ba">Uso</label>
            <select id="ba" value={avatarId} onChange={(e) => setAvatarId(e.target.value)}>
              {avatars.length === 0 ? <option value="">(hakuna)</option> : null}
              {avatars.map((a) => (
                <option key={a.id} value={a.id}>{a.label} · {a.status}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="be">Hisia</label>
            <select id="be" value={emotion} onChange={(e) => setEmotion(e.target.value)}>
              {EMOTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h3>Scripts ({entries.length})</h3>
          <label className="btn secondary sm" style={{ cursor: "pointer" }}>
            <Icon.upload /> {filesBusy ? "Inasoma…" : "Pakia faili nyingi (.txt/.md/.docx)"}
            <input
              type="file"
              accept=".txt,.md,.docx"
              multiple
              style={{ display: "none" }}
              disabled={filesBusy}
              onChange={(e) => addFromFiles(e.target.files)}
            />
          </label>
        </div>

        {entries.map((entry, i) => (
          <div key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, paddingTop: i > 0 ? 14 : 0, marginTop: i > 0 ? 14 : 10 }}>
            <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
              <input
                type="text"
                value={entry.name}
                onChange={(ev) => updateEntry(i, { name: ev.target.value })}
                placeholder="jina la video"
                style={{ fontWeight: 650, flex: 1 }}
              />
              <button className="secondary sm" onClick={() => removeEntry(i)} disabled={entries.length === 1} aria-label="Futa">
                <Icon.trash />
              </button>
            </div>
            <textarea
              value={entry.scriptText}
              onChange={(ev) => updateEntry(i, { scriptText: ev.target.value })}
              placeholder="Andika script yako ya Kiswahili hapa…"
              rows={4}
              style={{ marginTop: 8, width: "100%" }}
            />
          </div>
        ))}

        <button className="secondary" style={{ marginTop: 14 }} onClick={addEntry}>
          <Icon.plus /> Ongeza script
        </button>
      </div>

      <button onClick={submit} disabled={busy}>
        <Icon.play /> {busy ? "Inaweka kwenye foleni…" : `Anzisha foleni (${entries.filter((e) => e.scriptText.trim()).length} video)`}
      </button>
    </>
  );
}
