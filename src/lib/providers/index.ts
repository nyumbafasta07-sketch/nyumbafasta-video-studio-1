/**
 * Provider registry. One place maps env-var strings to implementations
 * (brief §2.1). Adding a real model = add a case, no caller changes.
 */
import { config } from "../config";
import { MockScriptProvider } from "./script/mock";
import { MockVoiceProvider } from "./voice/mock";
import { MockFaceProvider } from "./face/mock";
import { MockLipSyncProvider } from "./lipsync/mock";
import { FfmpegRenderer } from "./renderer/ffmpeg";
import type {
  FaceProvider,
  LipSyncProvider,
  ScriptProvider,
  VideoRenderer,
  VoiceProvider,
} from "./types";

export function getScriptProvider(): ScriptProvider {
  switch (config.providers.script) {
    case "mock":
      return new MockScriptProvider();
    default:
      throw new Error(`Unknown SCRIPT_PROVIDER: ${config.providers.script}`);
  }
}

export function getVoiceProvider(): VoiceProvider {
  switch (config.providers.voice) {
    case "mock":
      return new MockVoiceProvider();
    default:
      throw new Error(`Unknown VOICE_PROVIDER: ${config.providers.voice}`);
  }
}

export function getFaceProvider(): FaceProvider {
  switch (config.providers.face) {
    case "mock":
      return new MockFaceProvider();
    default:
      throw new Error(`Unknown FACE_PROVIDER: ${config.providers.face}`);
  }
}

export function getLipSyncProvider(): LipSyncProvider {
  switch (config.providers.lipsync) {
    case "mock":
      return new MockLipSyncProvider();
    default:
      throw new Error(`Unknown LIPSYNC_PROVIDER: ${config.providers.lipsync}`);
  }
}

export function getRenderer(): VideoRenderer {
  switch (config.providers.renderer) {
    case "ffmpeg":
      return new FfmpegRenderer();
    default:
      throw new Error(`Unknown RENDERER: ${config.providers.renderer}`);
  }
}

export * from "./types";
export { getGpu } from "./gpu";
