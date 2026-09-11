import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Icon } from "@/components/Icons";
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
  const activeJobs = jobs.filter((j) => !["COMPLETED", "FAILED", "CANCELLED"].includes(j.state)).length;

  return (
    <Shell
      active="/training"
      title="Training Studio"
      subtitle="Build the founder's voice / face / style from uploaded videos."
      actions={
        <span className={`badge ${rc.trainingProvider === "worker" ? "state" : "mock"}`}>
          {rc.trainingProvider}
        </span>
      }
    >
      <div className="notice">
        Upload videos → mark <b>Add to Training Dataset</b> → build a dataset →
        run a training job → evaluate → mark a version <b>PRODUCTION</b>. Nothing
        overwrites a previous version.
      </div>

      <div className="grid">
        <div className="stat">
          <span className="k">Videos</span>
          <span className="v">{videos.length}</span>
          <span className="sub">{marked} marked for training</span>
          <Link href="/training/videos">Manage →</Link>
        </div>
        <div className="stat">
          <span className="k">Datasets</span>
          <span className="v">{datasets.length}</span>
          <Link href="/training/datasets">Datasets →</Link>
        </div>
        <div className="stat">
          <span className="k">Active jobs</span>
          <span className="v">{activeJobs}</span>
          <Link href="/training/jobs">Jobs →</Link>
        </div>
        <div className="stat">
          <span className="k">Models</span>
          <span className="v">{listVersions().length}</span>
          <Link href="/training/models">All versions →</Link>
        </div>
      </div>

      <div className="card">
        <h3>Profiles</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Profile</th><th>Level</th><th>Production</th><th>Versions</th><th></th></tr>
            </thead>
            <tbody>
              {PROFILES.map((prof) => {
                const prod = productionVersion(prof.key);
                const count = listVersions(prof.key).length;
                return (
                  <tr key={prof.key}>
                    <td>
                      <div style={{ fontWeight: 550 }}>{prof.label}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>{prof.note}</div>
                    </td>
                    <td className="muted">L{prof.level}</td>
                    <td>
                      {prod ? (
                        <span className="badge production">{prod.label} · {prod.eval_score?.toFixed(1) ?? "—"}</span>
                      ) : (
                        <span className="muted">none yet</span>
                      )}
                    </td>
                    <td className="muted">{count}</td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/training/jobs?profile=${prof.key}`} className="btn ghost sm">Train</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Progressive levels</h3>
        <div className="row">
          {LEVELS.map((l) => (
            <span key={l.n} className="step">{l.label}</span>
          ))}
        </div>
        <p className="field-hint">Architected for all six; only what a phase needs is implemented.</p>
      </div>
    </Shell>
  );
}
