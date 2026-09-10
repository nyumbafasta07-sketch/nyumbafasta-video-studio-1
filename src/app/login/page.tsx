"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) {
      const next = new URLSearchParams(window.location.search).get("next") || "/";
      window.location.href = next;
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "login failed");
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: "12vh auto", padding: "0 20px" }}>
      <h2>Video Studio</h2>
      <p className="sub">Private tool. Enter the app password.</p>
      <form onSubmit={submit} className="card">
        <label htmlFor="pw">Password</label>
        <input
          id="pw"
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? (
          <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>
        ) : null}
        <button type="submit" disabled={busy || !password} style={{ marginTop: 16, width: "100%" }}>
          {busy ? "Checking…" : "Enter"}
        </button>
      </form>
      <p className="muted" style={{ fontSize: 12 }}>
        No account system — one shared password (see <span className="mono">SETUP.md</span>).
      </p>
    </div>
  );
}
