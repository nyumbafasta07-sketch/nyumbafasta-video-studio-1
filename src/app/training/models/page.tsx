import Link from "next/link";
import { Shell } from "@/components/Shell";
import { ModelsPanel } from "@/components/training/ModelsPanel";
import { bootstrap } from "@/lib/bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function TrainingModelsPage({ searchParams }: { searchParams: { v?: string } }) {
  bootstrap();
  return (
    <Shell
      active="/training"
      title="Training · Model versions"
      subtitle="Evaluate, compare, and promote. Founder is the final approver (§8.5)."
    >
      <p>
        <Link href="/training">← Training Studio</Link>
      </p>
      <ModelsPanel initialVersionId={searchParams.v} />
    </Shell>
  );
}
