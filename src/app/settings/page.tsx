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
      subtitle="Point the app at any GPU worker — no .env edit, no restart."
    >
      <SettingsForm />
      <div className="notice">
        To change the app password, regenerate <span className="mono">APP_PASSWORD_HASH</span>{" "}
        (<span className="mono">npm run hash-password</span>) and restart. No user management
        by design.
      </div>
    </Shell>
  );
}
