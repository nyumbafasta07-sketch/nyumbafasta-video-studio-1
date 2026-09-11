import Link from "next/link";
import { Shell } from "@/components/Shell";
import { JobsPanel } from "@/components/training/JobsPanel";
import { bootstrap } from "@/lib/bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function TrainingJobsPage({
  searchParams,
}: {
  searchParams: { profile?: string };
}) {
  bootstrap();
  return (
    <Shell active="/training" title="Training · Jobs">
      <p className="page-lead"><Link href="/training">← Training Studio</Link></p>
      <JobsPanel initialProfile={searchParams.profile} />
    </Shell>
  );
}
