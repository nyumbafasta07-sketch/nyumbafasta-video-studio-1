import Link from "next/link";
import { Shell } from "@/components/Shell";
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

  return (
    <Shell active="/" title="Dashboard" subtitle="Phase 2 — mock pipeline. Every output is fake by design.">
      <div className="notice">
        Script in → mock voice → mock avatar → mock lip-sync → green screen → MP4 out.
        Zero GPU. Finish real videos in CapCut.
      </div>

      <div className="grid" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="muted">Projects</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{projects.length}</div>
          <Link href="/projects">Open projects</Link>
        </div>
        <div className="card">
          <div className="muted">Active jobs</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{active.length}</div>
          <Link href="/create">Create a video</Link>
        </div>
        <div className="card">
          <div className="muted">Compute</div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className={`badge ${rc.gpuProvider === "http" ? "state" : "mock"}`}>
              gpu: {rc.gpuProvider}
            </span>
            <span className={`badge ${rc.trainingProvider === "worker" ? "state" : "mock"}`}>
              training: {rc.trainingProvider}
            </span>
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <span className="badge">renderer: {config.providers.renderer}</span>
          </div>
          <Link href="/settings">Change in Settings</Link>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Recent projects</h3>
        {projects.length === 0 ? (
          <p className="muted">None yet. <Link href="/projects">Create one.</Link></p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {projects.slice(0, 8).map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="muted">{new Date(p.created_at).toLocaleString()}</td>
                  <td><Link href={`/projects/${p.id}`}>open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Recent jobs</h3>
        {recentJobs.length === 0 ? (
          <p className="muted">No jobs yet.</p>
        ) : (
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
              {recentJobs.map((j) => {
                const cls =
                  j.state === "COMPLETED"
                    ? "completed"
                    : j.state === "FAILED"
                      ? "failed"
                      : "state";
                return (
                  <tr key={j.id}>
                    <td><span className={`badge ${cls}`}>{j.state}</span></td>
                    <td>
                      <Link href={`/projects/${j.project_id}`}>
                        {getProject(j.project_id)?.name ?? j.project_id}
                      </Link>
                    </td>
                    <td className="muted">{j.stage || "—"}</td>
                    <td className="muted">{new Date(j.created_at).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}
