import Link from "next/link";
import { Shell } from "@/components/Shell";
import { NewProjectForm } from "@/components/NewProjectForm";
import { Icon } from "@/components/Icons";
import { bootstrap } from "@/lib/bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function CreatePage() {
  bootstrap();
  return (
    <Shell
      active="/create"
      title="Create Video"
      subtitle="Step 1 of 4 — the script. Voice, avatar and generate continue on the project page."
      actions={
        <Link href="/create/batch" className="btn secondary sm">
          <Icon.layers /> Batch (video nyingi)
        </Link>
      }
    >
      <div className="steps">
        {["Script", "Voice", "Avatar", "Generate"].map((s, i) => (
          <span key={s} className={`step${i === 0 ? " active" : ""}`}>
            <span className="n">{i + 1}</span>
            {s}
          </span>
        ))}
      </div>
      <NewProjectForm />
    </Shell>
  );
}
