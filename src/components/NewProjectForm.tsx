"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScriptFileInput } from "./ScriptFileInput";

export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [scriptText, setScriptText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, scriptText }),
    });
    setBusy(false);
    if (res.ok) {
      const { project } = await res.json();
      router.push(`/projects/${project.id}`);
    } else {
      setError("Could not create project.");
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <h3 style={{ marginTop: 0 }}>New project</h3>
      <label htmlFor="np-name">Name</label>
      <input id="np-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
      <label htmlFor="np-script">Script (optional now, required to generate)</label>
      <textarea
        id="np-script"
        value={scriptText}
        onChange={(e) => setScriptText(e.target.value)}
        placeholder="Andika script yako ya Kiswahili hapa…"
      />
      <ScriptFileInput
        onText={(text) => setScriptText((prev) => (prev.trim() ? `${prev}\n${text}` : text))}
      />
      {error ? <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p> : null}
      <button type="submit" disabled={busy || !name.trim()} style={{ marginTop: 14 }}>
        {busy ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}
