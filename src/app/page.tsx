import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Icon } from "@/components/Icons";
import { bootstrap } from "@/lib/bootstrap";
import { config } from "@/lib/config";
import { getProject, listProjects, listJobsByStates, listRecentJobs } from "@/lib/repo";
import { getRuntimeConfig } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function Dashboard() {
  bootstrap();
  const projects = listProjects();
  const active = listJobsByStates([
    "QUEUED",
    "PROCESSING",
    "VOICE_GENERATING",
    "AVATAR_GENERATING",
    "LIP_SYNC",
    "RENDERING",
  ]);
  const recentJobs = listRecentJobs(8);
  const rc = getRuntimeConfig();

  const stateClass = (s: string) =>
    s === "COMPLETED" ? "completed" : s === "FAILED" ? "failed" : "state";

  return (
    <Shell
      active="/"
      title="Dashboard"
      subtitle="Script in → talking-head MP4 out. Finish in CapCut."
      actions={
        <Link href="/create" className="btn sm">
          <Icon.wand /> Create Video
        </Link>
      }
    >
      <div className="notice">
        <b>Phase 2 — mock pipeline.</b> Voice, avatar and lip-sync are placeholder
        output until real models are connected in <Link href="/settings">Settings → Compute</Link>.
      </div>

      <div className="grid">
        <div className="stat">
          <span className="k">Projects</span>
          <span className="v">{projects.length}</span>
          <Link href="/projects">Open projects →</Link>
        </div>
        <div className="stat">
          <span className="k">Active jobs</span>
          <span className="v">{active.length}</span>
          <span className="sub">{active.length ? "running now" : "idle"}</span>
        </div>
        <div className="stat">
          <span className="k">Compute</span>
          <span className="v" style={{ fontSize: 16, marginTop: 6 }}>
            <span className={`badge ${rc.gpuProvider === "http" ? "state" : "mock"}`}>gpu · {rc.gpuProvider}</span>
          </span>
          <div className="row" style={{ marginTop: 6 }}>
            <span className={`badge ${rc.trainingProvider === "worker" ? "state" : "mock"}`}>
              training · {rc.trainingProvider}
            </span>
          </div>
          <Link href="/settings">Change →</Link>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>Recent projects</h3>
          <Link href="/projects" className="btn ghost sm">All</Link>
        </div>
        {projects.length === 0 ? (
          <div className="empty">
            <Icon.folder />
            <div>No projects yet.</div>
            <Link href="/create" className="btn sm" style={{ marginTop: 10 }}>Create your first</Link>
          </div>
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
                {projects.slice(0, 6).map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 550 }}>{p.name}</td>
                    <td className="muted">{p.script_text ? `${p.script_text.length} chars` : "—"}</td>
                    <td className="muted">{new Date(p.created_at).toLocaleDateString()}</td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/projects/${p.id}`} className="btn ghost sm">Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Recent jobs</h3>
        {recentJobs.length === 0 ? (
          <div className="empty"><Icon.film /><div>No jobs yet.</div></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>State</th>
                  <th>Project</th>
                  <th>Stage</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map((j) => (
                  <tr key={j.id}>
                    <td><span className={`badge ${stateClass(j.state)}`}>{j.state}</span></td>
                    <td>
                      <Link href={`/projects/${j.project_id}`}>
                        {getProject(j.project_id)?.name ?? j.project_id}
                      </Link>
                    </td>
                    <td className="muted mono">{j.stage || "—"}</td>
                    <td className="muted">{new Date(j.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="muted" style={{ fontSize: 12 }}>
        renderer · {config.providers.renderer}
      </p>
    </Shell>
  );
}
