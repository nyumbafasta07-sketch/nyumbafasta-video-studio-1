/**
 * Persists a trained model's files (F5-TTS checkpoint etc.) on the APP's own
 * storage, independent of whichever GPU worker (Colab/Kaggle/local) produced
 * them. Every worker session is ephemeral — its disk vanishes when that
 * runtime disconnects or the founder switches to a different compute
 * backend. Without this, every switch meant retraining from zero. Bundles
 * are exported once after a successful training run and re-imported onto
 * whichever worker is active before it's asked to use/continue that model.
 */
import { getStorage } from "../storage";

function rel(kind: string, modelRef: string): string {
  return `training/model-bundles/${kind}/${modelRef}.tar.gz`;
}

export async function saveModelBundle(kind: string, modelRef: string, data: Buffer): Promise<void> {
  await getStorage().put({ path: rel(kind, modelRef), data, mime: "application/gzip" });
}

export async function hasModelBundle(kind: string, modelRef: string): Promise<boolean> {
  return getStorage().exists(rel(kind, modelRef));
}

export async function loadModelBundle(kind: string, modelRef: string): Promise<Buffer | null> {
  if (!(await hasModelBundle(kind, modelRef))) return null;
  return getStorage().get(rel(kind, modelRef));
}
