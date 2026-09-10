import Link from "next/link";
import { Shell } from "@/components/Shell";
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
    <Shell active="/projects" title="Projects">
      <NewProjectForm />

      <div className="card">
        <h3 style={{ marginTop: 0 }}>All projects</h3>
        {projects.length === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Script</th>
                <th>Created</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="muted">{p.script_text ? `${p.script_text.length} chars` : "—"}</td>
                  <td className="muted">{new Date(p.created_at).toLocaleString()}</td>
                  <td><Link href={`/projects/${p.id}`}>open</Link></td>
                  <td><DeleteProjectButton compact projectId={p.id} name={p.name} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}
