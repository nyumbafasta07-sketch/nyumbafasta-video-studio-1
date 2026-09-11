"use client";

import { useRef, useState } from "react";

/** §5 step 1: optional .txt/.md/.docx upload. Passes extracted text to the parent. */
export function ScriptFileInput({ onText }: { onText: (text: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/script/extract", { method: "POST", body: fd });
    setBusy(false);
    if (ref.current) ref.current.value = "";
    if (res.ok) {
      const { text } = await res.json();
      onText((text ?? "").trim());
      setMsg(`Loaded ${file.name}`);
    } else {
      const b = await res.json().catch(() => ({}));
      setMsg(b.error ?? "Could not read file.");
    }
  }

  return (
    <div className="row" style={{ marginTop: 8 }}>
      <input ref={ref} type="file" accept=".txt,.md,.docx" onChange={pick} disabled={busy} />
      {busy ? <span className="muted">reading…</span> : null}
      {msg ? <span className="muted" style={{ fontSize: 12 }}>{msg}</span> : null}
    </div>
  );
}
