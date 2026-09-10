import { config } from "../../config";
import { LocalMockGpu } from "./local-mock";
import { HttpGpu } from "./http";
import type { GpuProvider } from "./types";

let instance: GpuProvider | null = null;

export function getGpu(): GpuProvider {
  if (instance) return instance;
  switch (config.providers.gpu) {
    case "local-mock":
      instance = new LocalMockGpu();
      break;
    case "http":
      instance = new HttpGpu();
      break;
    default:
      throw new Error(`Unknown GPU_PROVIDER: ${config.providers.gpu}`);
  }
  return instance;
}

export function _setGpuForTests(g: GpuProvider | null): void {
  instance = g;
}

export * from "./types";
