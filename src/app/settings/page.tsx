import { Shell } from "@/components/Shell";
import { bootstrap } from "@/lib/bootstrap";
import { config } from "@/lib/config";
import { getSetting } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  bootstrap();
  const owner = getSetting("owner_label") ?? "Founder";

  const rows: Array<[string, string]> = [
    ["Owner", owner],
    ["Auth", config.passwordHashConfigured ? "password hash configured" : "NOT configured — logins refused"],
    ["Output", `${config.output.width}×${config.output.height} (9:16)`],
    ["Green screen", config.output.greenHex],
    ["Storage dir", config.storageDir],
    ["Database", config.databaseFile],
    ["GPU provider", config.providers.gpu],
    ["GPU worker URL", config.gpuWorker.url || "(unset — mocks only)"],
  ];

  return (
    <Shell active="/settings" title="Settings" subtitle="Read-only in Phase 2. Everything here is env-var driven.">
      <div className="card">
        <table>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <th style={{ width: 180 }}>{k}</th>
                <td className="mono">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="notice">
        Single-user tool. To change the password, regenerate{" "}
        <span className="mono">APP_PASSWORD_HASH</span> (<span className="mono">npm run hash-password</span>)
        and restart. No user management by design (brief §3).
      </div>
    </Shell>
  );
}
