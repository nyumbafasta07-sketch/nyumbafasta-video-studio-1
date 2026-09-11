"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icons";
import { confirmDialog, toast } from "./ui/feedback";

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
    const ok = await confirmDialog({
      title: `Delete “${name}”?`,
      body: "All its jobs and generated files are removed. This cannot be undone.",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      toast("Project deleted", "ok");
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    } else {
      toast("Could not delete the project.", "err");
    }
  }

  if (compact) {
    return (
      <button onClick={del} disabled={busy} className="icon-btn" title="Delete project">
        <Icon.trash />
      </button>
    );
  }
  return (
    <button onClick={del} disabled={busy} className="secondary danger">
      <Icon.trash /> {busy ? "Deleting…" : "Delete project"}
    </button>
  );
}
