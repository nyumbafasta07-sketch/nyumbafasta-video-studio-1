import Link from "next/link";
import { Shell } from "@/components/Shell";
import { bootstrap } from "@/lib/bootstrap";
import { config } from "@/lib/config";
import { listProjects, listJobsByStates } from "@/lib/repo";

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
          <div className="muted">Providers</div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="badge mock">voice: {config.providers.voice}</span>
            <span className="badge mock">face: {config.providers.face}</span>
            <span className="badge mock">lipsync: {config.providers.lipsync}</span>
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <span className="badge">gpu: {config.providers.gpu}</span>
            <span className="badge">renderer: {config.providers.renderer}</span>
          </div>
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
    </Shell>
  );
}
