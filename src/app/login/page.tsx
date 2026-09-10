"use client";

import { useState } from "react";
import { Icon } from "@/components/Icons";

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
      setError(body.error ?? "Login failed");
    }
  }

  return (
    <div className="auth">
      <div className="box">
        <div className="brand">
          <span className="logo">
            <Icon.film />
          </span>
          <div>
            <b>Video Studio</b>
            <span>private · single-user</span>
          </div>
        </div>

        <form onSubmit={submit} className="card">
          <label htmlFor="pw">Password</label>
          <input
            id="pw"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter the app password"
          />
          {error ? <p className="form-error">{error}</p> : null}
          <button type="submit" disabled={busy || !password} className="block" style={{ marginTop: 16 }}>
            {busy ? "Checking…" : "Enter"}
          </button>
        </form>

        <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>
          One shared password — no accounts. See <span className="mono">SETUP.md</span>.
        </p>
      </div>
    </div>
  );
}
