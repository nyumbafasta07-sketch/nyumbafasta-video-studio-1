"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScriptFileInput } from "./ScriptFileInput";
import { toast } from "./ui/feedback";

export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [scriptText, setScriptText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
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
      toast("Could not create the project.", "err");
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <h3>New project</h3>
      <label htmlFor="np-name">Name</label>
      <input id="np-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. NyumbaFasta launch teaser" />

      <label htmlFor="np-script">Script</label>
      <textarea
        id="np-script"
        value={scriptText}
        onChange={(e) => setScriptText(e.target.value)}
        placeholder="Andika script yako ya Kiswahili hapa…"
      />
      <ScriptFileInput onText={(t) => setScriptText((prev) => (prev.trim() ? `${prev}\n${t}` : t))} />
      <p className="field-hint">Optional now — required before you can generate.</p>

      <button type="submit" disabled={busy || !name.trim()} style={{ marginTop: 14 }}>
        {busy ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}
