/**
 * GPUProvider — the cloud->local migration boundary (brief §2.3, §9).
 * Phase 2: `local-mock` runs fake generation in-process.
 * Phase 3+: `http` posts the same tasks to the Python worker (Colab/Kaggle/local
 * NVIDIA). Nothing else in the app changes when that flips.
 */

export type GpuTaskType = "voice" | "face" | "lipsync";

export interface GpuTask {
  type: GpuTaskType;
  projectId: string;
  jobId: string;
  /** task-specific args; for local artifacts these are storage-relative paths */
  payload: Record<string, unknown>;
}

export interface GpuArtifact {
  /** raw bytes of the produced file */
  data: Buffer;
  mime: string;
  /** provider-declared honesty flag — never blurred (brief §0) */
  kind: "MOCK" | "EXPERIMENTAL" | "PRODUCTION";
  model: string;
  meta: Record<string, unknown>;
}

export interface GpuProvider {
  readonly name: string;
  /** health/capability probe; mocks always return true */
  available(): Promise<boolean>;
  execute(task: GpuTask): Promise<GpuArtifact>;
}
