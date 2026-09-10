import Link from "next/link";
import { Shell } from "@/components/Shell";
import { bootstrap } from "@/lib/bootstrap";
import { getRuntimeConfig } from "@/lib/runtime-config";
import {
  listDatasets,
  listTrainingJobs,
  listVersions,
  listVideos,
  productionVersion,
} from "@/lib/training/repo";
import { PROFILES, LEVELS } from "@/lib/training/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function TrainingHub() {
  bootstrap();
  const rc = getRuntimeConfig();
  const videos = listVideos();
  const marked = videos.filter((v) => v.in_dataset).length;
  const datasets = listDatasets();
  const jobs = listTrainingJobs();
  const activeJobs = jobs.filter(
    (j) => !["COMPLETED", "FAILED", "CANCELLED"].includes(j.state),
  ).length;

  return (
    <Shell
      active="/training"
      title="Training Studio"
      subtitle="Brief §8 — build the founder's voice / face / style profiles. Training runs MOCK for now (no GPU); real models plug in behind the same seam."
    >
      <div className="notice">
        Flow: upload authorized videos → mark <b>Add to Training Dataset</b> →
        build a dataset version → run a training job → evaluate → mark a version{" "}
        <b>PRODUCTION</b>. Nothing overwrites a previous version.
      </div>

      <div className="grid" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="muted">Videos</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{videos.length}</div>
          <div className="muted">{marked} marked for training</div>
          <Link href="/training/videos">Manage videos</Link>
        </div>
        <div className="card">
          <div className="muted">Datasets</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{datasets.length}</div>
          <Link href="/training/datasets">Datasets</Link>
        </div>
        <div className="card">
          <div className="muted">Training jobs</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{activeJobs}</div>
          <div className="muted">{activeJobs} running</div>
          <Link href="/training/jobs">Jobs</Link>
        </div>
        <div className="card">
          <div className="muted">Training provider</div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className={`badge ${rc.trainingProvider === "worker" ? "state" : "mock"}`}>
              {rc.trainingProvider}
            </span>
          </div>
          <Link href="/settings">Change in Settings</Link> ·{" "}
          <Link href="/training/models">Model versions</Link>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Profiles (built independently — §8.3)</h3>
        <table>
          <thead>
            <tr>
              <th>Profile</th>
              <th>Level</th>
              <th>Production</th>
              <th>Versions</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {PROFILES.map((p) => {
              const prod = productionVersion(p.key);
              const count = listVersions(p.key).length;
              return (
                <tr key={p.key}>
                  <td>
                    <b>{p.label}</b>
                    <div className="muted" style={{ fontSize: 12 }}>{p.note}</div>
                  </td>
                  <td className="muted">L{p.level}</td>
                  <td>
                    {prod ? (
                      <span className="badge production">
                        {prod.label} · {prod.eval_score?.toFixed(1) ?? "—"}
                      </span>
                    ) : (
                      <span className="muted">none yet</span>
                    )}
                  </td>
                  <td className="muted">{count}</td>
                  <td>
                    <Link href={`/training/jobs?profile=${p.key}`}>train</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Progressive levels (§8.4)</h3>
        <div className="row">
          {LEVELS.map((l) => (
            <span key={l.n} className="step">
              {l.label}
            </span>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          Architected for all six; only what a phase needs is implemented.
        </p>
      </div>
    </Shell>
  );
}
