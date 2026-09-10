import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { ProjectWorkspace } from "@/components/ProjectWorkspace";
import { bootstrap } from "@/lib/bootstrap";
import { config } from "@/lib/config";
import { getProject, listAvatars, listJobsForProject, listVoices } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ProjectDetail({ params }: { params: { id: string } }) {
  bootstrap();
  const project = getProject(params.id);
  if (!project) notFound();

  const jobs = listJobsForProject(project.id);
  const voices = listVoices().map((v) => ({ id: v.id, label: v.label, status: v.status }));
  const avatars = listAvatars().map((a) => ({ id: a.id, label: a.label, status: a.status }));

  return (
    <Shell active="/projects" title={project.name} subtitle={`Project ${project.id}`}>
      <p>
        <Link href="/projects">← all projects</Link>
      </p>
      <ProjectWorkspace
        projectId={project.id}
        initialScript={project.script_text}
        voices={voices}
        avatars={avatars}
        defaultBackground={config.output.greenHex}
        pastJobIds={jobs.map((j) => j.id)}
      />
    </Shell>
  );
}
