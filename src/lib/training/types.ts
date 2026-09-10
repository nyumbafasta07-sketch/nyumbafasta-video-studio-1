/** Training Studio domain types (brief §8). */

export type Profile =
  | "voice"
  | "speaking_style"
  | "face_identity"
  | "face_performance";

export const PROFILES: { key: Profile; label: string; level: number; note: string }[] = [
  { key: "voice", label: "Voice", level: 1, note: "pitch, accent, pronunciation, rhythm, breathing — Tanzanian Swahili" },
  { key: "speaking_style", label: "Speaking Style", level: 4, note: "sentence length, pace, pauses, emphasis, intro/CTA patterns" },
  { key: "face_identity", label: "Face Identity", level: 2, note: "structure, skin, eyes, mouth, nose, hair — consistent, no beautification" },
  { key: "face_performance", label: "Face Performance", level: 5, note: "blinking, brows, head/eye motion, micro-expressions, timing" },
];

/** L1..L6 progressive levels (§8.4). */
export const LEVELS = [
  { n: 1, label: "L1 Voice only" },
  { n: 2, label: "L2 Face only" },
  { n: 3, label: "L3 Voice + Face" },
  { n: 4, label: "L4 Speaking style" },
  { n: 5, label: "L5 Performance" },
  { n: 6, label: "L6 Full digital twin" },
];

export type TrainingState =
  | "QUEUED"
  | "PREPROCESSING"
  | "TRANSCRIBING"
  | "BUILDING_DATASET"
  | "TRAINING"
  | "EVALUATING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export const TRAINING_NON_TERMINAL: TrainingState[] = [
  "QUEUED",
  "PREPROCESSING",
  "TRANSCRIBING",
  "BUILDING_DATASET",
  "TRAINING",
  "EVALUATING",
];

export type ModelStatus =
  | "experimental"
  | "approved"
  | "production"
  | "rejected"
  | "archived";

/** Allowed status transitions (§8.5). Founder is the human approver. */
export const STATUS_TRANSITIONS: Record<ModelStatus, ModelStatus[]> = {
  experimental: ["approved", "rejected", "archived"],
  approved: ["production", "rejected", "archived"],
  production: ["archived", "approved"],
  rejected: ["archived", "experimental"],
  archived: [],
};

/** Fixed evaluation scripts (§8.5) — Tanzanian Swahili across categories. */
export const EVAL_SCRIPTS: { key: string; label: string; text: string }[] = [
  { key: "educational", label: "Educational", text: "Leo tutajifunza namna ya kutengeneza bajeti rahisi ya kila mwezi kwa hatua tatu." },
  { key: "business", label: "Business", text: "NyumbaFasta imesaidia wateja zaidi ya elfu kumi kupata nyumba bila usumbufu." },
  { key: "excited", label: "Excited", text: "Jamani, hii ni habari kubwa sana — subiri uone kitakachofuata!" },
  { key: "storytelling", label: "Storytelling", text: "Nakumbuka nilipokuwa naanza, nikiwa na simu moja tu na ndoto kubwa." },
  { key: "cta", label: "Call to action", text: "Bonyeza link iliyoko chini, jiunge leo, na uanze mara moja." },
  { key: "mixed", label: "Mixed SW/EN", text: "Fungua dashboard, weka password, halafu upload content yako ya kwanza." },
];

export interface TrainingVideo {
  id: string;
  filename: string;
  path: string;
  bytes: number;
  mime: string;
  in_dataset: boolean;
  quality_score: number | null;
  quality_status: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface Dataset {
  id: string;
  label: string;
  version_num: number;
  video_ids: string[];
  clip_count: number;
  speech_seconds: number;
  frame_count: number;
  face_ok_ratio: number;
  notes: string;
  created_at: string;
}

export interface StageProgress {
  status: "pending" | "running" | "done" | "error";
  attempt: number;
  startedAt?: string;
  endedAt?: string;
  error?: string;
}

export interface TrainingJob {
  id: string;
  profile: Profile;
  level: number;
  dataset_id: string | null;
  state: TrainingState;
  stage: string;
  stage_status: string;
  progress: Record<string, StageProgress>;
  base_model: string;
  config: Record<string, unknown>;
  result_version_id: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface ModelVersion {
  id: string;
  profile: Profile;
  label: string;
  version_num: number;
  base_model: string;
  dataset_id: string | null;
  training_job_id: string | null;
  eval_score: number | null;
  eval: Record<string, unknown>;
  status: ModelStatus;
  license: string;
  gpu_used: string;
  config: Record<string, unknown>;
  notes: string;
  created_at: string;
}

export interface EvalRun {
  id: string;
  version_id: string;
  test_key: string;
  script_text: string;
  output_path: string | null;
  scores: Record<string, number>;
  created_at: string;
}
