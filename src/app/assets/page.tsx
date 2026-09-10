import { Shell } from "@/components/Shell";
import { bootstrap } from "@/lib/bootstrap";
import { listAssetsForProject, listProjects } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function AssetsPage() {
  bootstrap();
  const projects = listProjects();
  const rows = projects.flatMap((p) =>
    listAssetsForProject(p.id).map((a) => ({ project: p.name, ...a })),
  );

  return (
    <Shell active="/assets" title="Assets" subtitle="Generated files, per project. Served only through the app (never a public path).">
      {rows.length === 0 ? (
        <p className="muted">No generated assets yet.</p>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Kind</th>
                <th>Path</th>
                <th>Size</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>{a.project}</td>
                  <td><span className="badge">{a.kind}</span></td>
                  <td className="mono">{a.path}</td>
                  <td className="muted">{(a.bytes / 1024).toFixed(1)} KB</td>
                  <td className="muted">{new Date(a.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
