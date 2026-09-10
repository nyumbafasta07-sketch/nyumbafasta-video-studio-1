import Link from "next/link";
import { Shell } from "@/components/Shell";
import { DatasetsPanel } from "@/components/training/DatasetsPanel";
import { bootstrap } from "@/lib/bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function TrainingDatasetsPage() {
  bootstrap();
  return (
    <Shell active="/training" title="Training · Datasets">
      <p className="page-lead"><Link href="/training">← Training Studio</Link></p>
      <DatasetsPanel />
    </Shell>
  );
}
