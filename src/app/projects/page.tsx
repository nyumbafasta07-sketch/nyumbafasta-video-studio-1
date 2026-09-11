import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Icon } from "@/components/Icons";
import { NewProjectForm } from "@/components/NewProjectForm";
import { DeleteProjectButton } from "@/components/DeleteProjectButton";
import { bootstrap } from "@/lib/bootstrap";
import { listProjects } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ProjectsPage() {
  bootstrap();
  const projects = listProjects();

  return (
    <Shell active="/projects" title="Projects" subtitle="One project per video you're making.">
      <NewProjectForm />

      <div className="card">
        <h3>All projects</h3>
        {projects.length === 0 ? (
          <div className="empty"><Icon.folder /><div>Nothing here yet.</div></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Script</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 550 }}>{p.name}</td>
                    <td className="muted">{p.script_text ? `${p.script_text.length} chars` : "—"}</td>
                    <td className="muted">{new Date(p.created_at).toLocaleString()}</td>
                    <td>
                      <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                        <Link href={`/projects/${p.id}`} className="btn ghost sm">Open</Link>
                        <DeleteProjectButton compact projectId={p.id} name={p.name} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}
