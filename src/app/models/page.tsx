import { Shell } from "@/components/Shell";
import { bootstrap } from "@/lib/bootstrap";
import { config } from "@/lib/config";
import { listAvatars, listVoices } from "@/lib/repo";
import { getRuntimeConfig } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ModelsPage() {
  bootstrap();
  const voices = listVoices();
  const avatars = listAvatars();
  const rc = getRuntimeConfig();

  const rows: [string, string][] = [
    ["script", config.providers.script],
    ["voice", config.providers.voice],
    ["face", config.providers.face],
    ["lipsync", config.providers.lipsync],
    ["renderer", config.providers.renderer],
    ["gpu", rc.gpuProvider],
    ["training", rc.trainingProvider],
  ];

  return (
    <Shell
      active="/models"
      title="Models"
      subtitle="Phase 2 — everything is MOCK. Real models connect in Settings → Compute and Training Studio."
    >
      <div className="card">
        <h3>Active providers</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Interface</th><th>Implementation</th><th>Kind</th></tr>
            </thead>
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <td style={{ fontWeight: 550 }}>{k}</td>
                  <td className="mono">{v}</td>
                  <td>
                    <span className={`badge ${v === "http" || v === "worker" ? "state" : v === "ffmpeg" ? "plain" : "mock"}`}>
                      {v === "ffmpeg" ? "tool" : v === "http" || v === "worker" ? "live" : "mock"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="field-hint">
          Set generation via env vars, or GPU/training in <a href="/settings">Settings</a>.
        </p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="card">
          <h3>Voices</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Label</th><th>Provider</th><th>Status</th></tr></thead>
              <tbody>
                {voices.map((v) => (
                  <tr key={v.id}>
                    <td>{v.label} {v.is_default ? <span className="muted">· default</span> : null}</td>
                    <td className="mono">{v.provider}</td>
                    <td><span className={`badge ${v.status}`}>{v.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3>Avatars</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Label</th><th>Provider</th><th>Status</th></tr></thead>
              <tbody>
                {avatars.map((a) => (
                  <tr key={a.id}>
                    <td>{a.label} {a.is_default ? <span className="muted">· default</span> : null}</td>
                    <td className="mono">{a.provider}</td>
                    <td><span className={`badge ${a.status}`}>{a.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}
