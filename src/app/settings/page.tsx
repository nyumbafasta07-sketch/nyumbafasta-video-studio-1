import { Shell } from "@/components/Shell";
import { SettingsForm } from "@/components/SettingsForm";
import { bootstrap } from "@/lib/bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  bootstrap();
  return (
    <Shell
      active="/settings"
      title="Settings"
      subtitle="Compute is switchable here — point the app at any GPU worker without editing .env or restarting."
    >
      <SettingsForm />
      <div className="notice">
        Single-user tool. To change the password, regenerate{" "}
        <span className="mono">APP_PASSWORD_HASH</span> (<span className="mono">npm run hash-password</span>)
        and restart. No user management by design (brief §3).
      </div>
    </Shell>
  );
}
