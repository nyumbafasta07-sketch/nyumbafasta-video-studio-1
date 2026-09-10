"use client";

import { useState } from "react";
import { JobProgress } from "./JobProgress";
import { ScriptFileInput } from "./ScriptFileInput";
import { Icon } from "./Icons";
import { toast } from "./ui/feedback";

interface Opt {
  id: string;
  label: string;
  status: string;
}
const EMOTIONS = ["Neutral", "Friendly", "Excited", "Serious", "Professional", "Storytelling"];
// which emotions the mock engine can really act on (§5: don't fake a control)
const SUPPORTED_EMOTIONS = new Set(["Neutral"]);

export function ProjectWorkspace({
  projectId,
  initialScript,
  voices,
  avatars,
  defaultBackground,
  pastJobIds,
}: {
  projectId: string;
  initialScript: string;
  voices: Opt[];
  avatars: Opt[];
  defaultBackground: string;
  pastJobIds: string[];
}) {
  const [script, setScript] = useState(initialScript);
  const [savedScript, setSavedScript] = useState(initialScript);
  const [voiceId, setVoiceId] = useState(voices[0]?.id ?? "");
  const [avatarId, setAvatarId] = useState(avatars[0]?.id ?? "");
  const [emotion, setEmotion] = useState("Neutral");
  const [background, setBackground] = useState(defaultBackground);
  const [savingScript, setSavingScript] = useState(false);
  const [starting, setStarting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const dirty = script !== savedScript;
  const step = !savedScript.trim() ? 1 : !activeJobId ? 3 : 4;

  async function saveScript() {
    setSavingScript(true);
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scriptText: script }),
    });
    setSavingScript(false);
    if (res.ok) {
      setSavedScript(script);
      toast("Script saved", "ok");
    }
  }

  async function generate() {
    setError("");
    if (dirty) await saveScript();
    if (!script.trim()) {
      setError("Add a script first.");
      return;
    }
    setStarting(true);
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, voiceId, avatarId, emotion, background }),
    });
    setStarting(false);
    if (res.ok) {
      const { job } = await res.json();
      setActiveJobId(job.id);
    } else {
      const b = await res.json().catch(() => ({}));
      setError(typeof b.error === "string" ? b.error : "Could not start job.");
    }
  }

  return (
    <>
      <div className="steps">
        {["Script", "Voice", "Avatar", "Generate"].map((s, i) => (
          <span key={s} className={`step${i + 1 === step ? " active" : i + 1 < step ? " done" : ""}`}>
            <span className="n">{i + 1 < step ? "✓" : i + 1}</span>
            {s}
          </span>
        ))}
      </div>

      <div className="card">
        <div className="card-h">
          <h3>1 · Script</h3>
          <span className="muted" style={{ fontSize: 12 }}>{script.length} chars</span>
        </div>
        <textarea value={script} onChange={(e) => setScript(e.target.value)} />
        <ScriptFileInput onText={(t) => setScript((prev) => (prev.trim() ? `${prev}\n${t}` : t))} />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="secondary" onClick={saveScript} disabled={!dirty || savingScript}>
            {savingScript ? "Saving…" : dirty ? "Save script" : "Saved"}
          </button>
        </div>
      </div>

      <div className="card">
        <h3>2 · Voice &amp; 3 · Avatar</h3>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          <div>
            <label htmlFor="voice">Voice</label>
            <select id="voice" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>{v.label} ({v.status})</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="avatar">Avatar</label>
            <select id="avatar" value={avatarId} onChange={(e) => setAvatarId(e.target.value)}>
              {avatars.map((a) => (
                <option key={a.id} value={a.id}>{a.label} ({a.status})</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="emotion">Emotion</label>
            <select id="emotion" value={emotion} onChange={(e) => setEmotion(e.target.value)}>
              {EMOTIONS.map((e) => (
                <option key={e} value={e}>{e}{SUPPORTED_EMOTIONS.has(e) ? "" : " — experimental"}</option>
              ))}
            </select>
            {!SUPPORTED_EMOTIONS.has(emotion) ? (
              <p className="field-hint">The mock engine can’t control this — it will sound Neutral.</p>
            ) : null}
          </div>
          <div>
            <label htmlFor="bg">Green-screen colour</label>
            <input id="bg" type="text" value={background} onChange={(e) => setBackground(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        <h3>4 · Generate</h3>
        {error ? <p className="form-error">{error}</p> : null}
        <button onClick={generate} disabled={starting}>
          <Icon.play /> {starting ? "Starting…" : "Generate video"}
        </button>
        <p className="field-hint">9:16, 1080×1920, solid green background. Finish in CapCut.</p>
      </div>

      {activeJobId ? <JobProgress jobId={activeJobId} /> : null}

      {pastJobIds.filter((id) => id !== activeJobId).length > 0 ? (
        <div className="card">
          <h3>Past jobs</h3>
          {pastJobIds
            .filter((id) => id !== activeJobId)
            .map((id) => (
              <JobProgress key={id} jobId={id} />
            ))}
        </div>
      ) : null}
    </>
  );
}
