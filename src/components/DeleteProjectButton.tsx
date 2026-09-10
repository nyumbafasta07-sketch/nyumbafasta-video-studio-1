"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteProjectButton({
  projectId,
  name,
  redirectTo,
  compact = false,
}: {
  projectId: string;
  name: string;
  redirectTo?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    if (!confirm(`Delete "${name}" and all its jobs and files? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    } else {
      alert("Could not delete the project.");
    }
  }

  if (compact) {
    return (
      <button
        onClick={del}
        disabled={busy}
        className="secondary"
        style={{ padding: "4px 10px", fontSize: 12 }}
      >
        {busy ? "…" : "delete"}
      </button>
    );
  }
  return (
    <button onClick={del} disabled={busy} className="secondary" style={{ color: "var(--danger)" }}>
      {busy ? "Deleting…" : "Delete project"}
    </button>
  );
}
