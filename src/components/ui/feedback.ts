"use client";

/* Dependency-free toast + confirm. Imperative DOM so it works from any client
   component without a provider. */

function toaster(): HTMLElement {
  let el = document.querySelector<HTMLElement>(".toaster");
  if (!el) {
    el = document.createElement("div");
    el.className = "toaster";
    document.body.appendChild(el);
  }
  return el;
}

export function toast(message: string, kind: "ok" | "err" | "info" = "info"): void {
  if (typeof document === "undefined") return;
  const t = document.createElement("div");
  t.className = `toast ${kind === "info" ? "" : kind}`.trim();
  t.textContent = message;
  toaster().appendChild(t);
  setTimeout(() => {
    t.style.transition = "opacity .2s, transform .2s";
    t.style.opacity = "0";
    t.style.transform = "translateY(6px)";
    setTimeout(() => t.remove(), 220);
  }, 3400);
}

export function confirmDialog(opts: {
  title: string;
  body?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(false);
    const bg = document.createElement("div");
    bg.className = "dialog-bg";
    const box = document.createElement("div");
    box.className = "dialog";
    const h = document.createElement("h3");
    h.textContent = opts.title;
    box.appendChild(h);
    if (opts.body) {
      const p = document.createElement("p");
      p.textContent = opts.body;
      box.appendChild(p);
    }
    const row = document.createElement("div");
    row.className = "row";
    const cancel = document.createElement("button");
    cancel.className = "secondary";
    cancel.textContent = opts.cancelText ?? "Cancel";
    const ok = document.createElement("button");
    ok.className = opts.danger ? "danger" : "";
    ok.textContent = opts.confirmText ?? "Confirm";
    row.append(cancel, ok);
    box.appendChild(row);
    bg.appendChild(box);
    document.body.appendChild(bg);

    const close = (v: boolean) => {
      bg.remove();
      document.removeEventListener("keydown", onKey);
      resolve(v);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    };
    cancel.onclick = () => close(false);
    ok.onclick = () => close(true);
    bg.onclick = (e) => {
      if (e.target === bg) close(false);
    };
    document.addEventListener("keydown", onKey);
    ok.focus();
  });
}
