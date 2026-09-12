import Link from "next/link";
import { Shell } from "@/components/Shell";
import { BatchCreateForm } from "@/components/BatchCreateForm";
import { bootstrap } from "@/lib/bootstrap";
import { listAvatars, listVoices } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function BatchCreatePage() {
  bootstrap();
  const voices = listVoices().map((v) => ({ id: v.id, label: v.label, status: v.status }));
  const avatars = listAvatars().map((a) => ({ id: a.id, label: a.label, status: a.status }));

  return (
    <Shell
      active="/create"
      title="Batch — video nyingi kwa foleni moja"
      subtitle="Unganisha GPU mara moja, zalisha video kadhaa mfululizo bila kusubiri kila moja."
    >
      <p className="page-lead">
        <Link href="/create">← Video moja tu</Link>
      </p>
      <BatchCreateForm voices={voices} avatars={avatars} />
    </Shell>
  );
}
