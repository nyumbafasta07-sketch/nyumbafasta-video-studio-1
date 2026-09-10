import { Shell } from "@/components/Shell";
import { NewProjectForm } from "@/components/NewProjectForm";
import { bootstrap } from "@/lib/bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function CreatePage() {
  bootstrap();
  return (
    <Shell
      active="/create"
      title="Create Video"
      subtitle="Step 1 of 4 — script. Steps 2 (voice), 3 (avatar) and 4 (generate) continue on the project page."
    >
      <div className="steps">
        <span className="step active">1 · Script</span>
        <span className="step">2 · Voice</span>
        <span className="step">3 · Avatar</span>
        <span className="step">4 · Generate</span>
      </div>
      <NewProjectForm />
    </Shell>
  );
}
