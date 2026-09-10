/**
 * Provider interfaces (brief §2.1). Every one has a `mock` impl now; real impls
 * land in Phases 3-6 behind the same signatures. `kind` on each result records
 * MOCK / EXPERIMENTAL / PRODUCTION so it is never blurred (brief §0).
 */

export type OutputKind = "MOCK" | "EXPERIMENTAL" | "PRODUCTION";

export interface ProviderResultBase {
  kind: OutputKind;
  provider: string;
  model: string;
  /** storage-relative path of the produced artifact, if any */
  path?: string;
  meta: Record<string, unknown>;
}

/* ---- Script ---- */
export interface ScriptSegment {
  index: number;
  text: string;
  estSeconds: number;
}
export interface ScriptAnalysis extends ProviderResultBase {
  normalizedText: string;
  segments: ScriptSegment[];
  totalEstSeconds: number;
  warnings: string[];
}
export interface ScriptProvider {
  readonly name: string;
  analyze(input: { text: string }): Promise<ScriptAnalysis>;
}

/* ---- Voice ---- */
export interface VoiceResult extends ProviderResultBase {
  path: string; // audio file, always present
  durationSeconds: number;
  sampleRate: number;
}
export interface VoiceProvider {
  readonly name: string;
  synthesize(input: {
    projectId: string;
    text: string;
    voiceId: string;
    emotion: string;
    outDir: string;
  }): Promise<VoiceResult>;
}

/* ---- Face / Avatar ---- */
export interface FaceResult extends ProviderResultBase {
  path: string; // still image or frame pack
  width: number;
  height: number;
}
export interface FaceProvider {
  readonly name: string;
  render(input: {
    projectId: string;
    avatarId: string;
    width: number;
    height: number;
    outDir: string;
  }): Promise<FaceResult>;
}

/* ---- Lip-sync ---- */
export interface LipSyncResult extends ProviderResultBase {
  path: string; // talking-head clip, no background
  durationSeconds: number;
  width: number;
  height: number;
}
export interface LipSyncProvider {
  readonly name: string;
  sync(input: {
    projectId: string;
    facePath: string;
    audioPath: string;
    width: number;
    height: number;
    outDir: string;
  }): Promise<LipSyncResult>;
}

/* ---- Video renderer ---- */
export interface RenderResult extends ProviderResultBase {
  path: string; // final MP4
  durationSeconds: number;
  width: number;
  height: number;
  hasAudio: boolean;
}
export interface VideoRenderer {
  readonly name: string;
  render(input: {
    projectId: string;
    lipSyncPath: string;
    audioPath: string;
    backgroundHex: string;
    width: number;
    height: number;
    outDir: string;
    captionText?: string;
  }): Promise<RenderResult>;
}
