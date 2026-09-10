import { LocalMockGpu } from "./local-mock";
import { HttpGpu } from "./http";
import { getRuntimeConfig, onProviderConfigChange } from "../../runtime-config";
import type { GpuProvider } from "./types";

let instance: GpuProvider | null = null;

export function getGpu(): GpuProvider {
  if (instance) return instance;
  const name = getRuntimeConfig().gpuProvider;
  switch (name) {
    case "local-mock":
      instance = new LocalMockGpu();
      break;
    case "http":
      instance = new HttpGpu();
      break;
    default:
      throw new Error(`Unknown GPU provider: ${name}`);
  }
  return instance;
}

onProviderConfigChange(() => {
  instance = null;
});

export function _setGpuForTests(g: GpuProvider | null): void {
  instance = g;
}

export * from "./types";
