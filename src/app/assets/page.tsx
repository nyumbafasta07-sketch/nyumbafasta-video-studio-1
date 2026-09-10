import { Shell } from "@/components/Shell";
import { Icon } from "@/components/Icons";
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
    <Shell active="/assets" title="Assets" subtitle="Generated files, per project. Served only through the app.">
      {rows.length === 0 ? (
        <div className="empty"><Icon.layers /><div>No generated assets yet.</div></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
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
                    <td><span className="badge plain">{a.kind}</span></td>
                    <td className="mono muted">{a.path}</td>
                    <td className="muted">{(a.bytes / 1024).toFixed(1)} KB</td>
                    <td className="muted">{new Date(a.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Shell>
  );
}
