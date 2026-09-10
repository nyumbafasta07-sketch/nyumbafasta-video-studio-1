import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/test/**/*.test.ts"],
    hookTimeout: 30000,
    testTimeout: 60000,
    pool: "forks",
    retry: 1, // the end-to-end pipeline test shells out to ffmpeg; tolerate a transient
    env: {
      SCRIPT_PROVIDER: "mock",
      VOICE_PROVIDER: "mock",
      FACE_PROVIDER: "mock",
      LIPSYNC_PROVIDER: "mock",
      RENDERER: "ffmpeg",
      GPU_PROVIDER: "local-mock",
      SESSION_SECRET: "test-secret",
    },
  },
});
