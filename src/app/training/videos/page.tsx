import Link from "next/link";
import { Shell } from "@/components/Shell";
import { VideosPanel } from "@/components/training/VideosPanel";
import { bootstrap } from "@/lib/bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function TrainingVideosPage() {
  bootstrap();
  return (
    <Shell active="/training" title="Training · Videos">
      <p className="page-lead"><Link href="/training">← Training Studio</Link></p>
      <VideosPanel />
    </Shell>
  );
}
