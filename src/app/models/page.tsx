import { Shell } from "@/components/Shell";
import { bootstrap } from "@/lib/bootstrap";
import { config } from "@/lib/config";
import { listAvatars, listVoices } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ModelsPage() {
  bootstrap();
  const voices = listVoices();
  const avatars = listAvatars();

  const providerRows = [
    ["script", config.providers.script],
    ["voice", config.providers.voice],
    ["face", config.providers.face],
    ["lipsync", config.providers.lipsync],
    ["renderer", config.providers.renderer],
    ["gpu", config.providers.gpu],
  ] as const;

  return (
    <Shell
      active="/models"
      title="Models"
      subtitle="Phase 2 — everything is MOCK. Real voice/face/lip-sync models arrive in Phases 3–5, behind the same interfaces."
    >
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Active providers</h3>
        <table>
          <thead>
            <tr>
              <th>Interface</th>
              <th>Implementation</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {providerRows.map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td className="mono">{v}</td>
                <td>
                  <span className="badge mock">{v === "ffmpeg" ? "TOOL" : "MOCK"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12 }}>
          Change via env vars (<span className="mono">VOICE_PROVIDER</span>, …). See{" "}
          <span className="mono">.env.example</span>.
        </p>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Voices</h3>
        <table>
          <thead>
            <tr><th>Label</th><th>Provider</th><th>Default</th><th>Status</th></tr>
          </thead>
          <tbody>
            {voices.map((v) => (
              <tr key={v.id}>
                <td>{v.label}</td>
                <td className="mono">{v.provider}</td>
                <td>{v.is_default ? "yes" : ""}</td>
                <td><span className={`badge ${v.status}`}>{v.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Avatars</h3>
        <table>
          <thead>
            <tr><th>Label</th><th>Provider</th><th>Default</th><th>Status</th></tr>
          </thead>
          <tbody>
            {avatars.map((a) => (
              <tr key={a.id}>
                <td>{a.label}</td>
                <td className="mono">{a.provider}</td>
                <td>{a.is_default ? "yes" : ""}</td>
                <td><span className={`badge ${a.status}`}>{a.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
