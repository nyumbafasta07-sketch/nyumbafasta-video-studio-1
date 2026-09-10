/**
 * MOCK FaceProvider. Delegates to the GPUProvider seam, writes a portrait PNG
 * into the project's avatar/ folder. Real identity-consistent face rendering is
 * Phase 4.
 */
import { getStorage, projectPaths } from "../../storage";
import { getGpu } from "../gpu";
import { productionVersion } from "../../training/repo";
import type { FaceProvider, FaceResult } from "../types";

export class MockFaceProvider implements FaceProvider {
  readonly name = "mock";

  async render(input: {
    projectId: string;
    avatarId: string;
    width: number;
    height: number;
    outDir: string;
  }): Promise<FaceResult> {
    // portrait crop, narrower than the final 9:16 frame
    const faceW = Math.round(input.width * 0.7);
    const faceH = Math.round(input.height * 0.55);

    const gpu = getGpu();
    // on a real worker, use the founder's trained PRODUCTION face identity
    // profile (a real reference from the training video, not a cartoon)
    let modelRef = "";
    if (gpu.name !== "local-mock") {
      modelRef = String(productionVersion("face_identity")?.config?.modelRef ?? "");
    }
    const artifact = await gpu.execute({
      type: "face",
      projectId: input.projectId,
      jobId: "",
      payload: { avatarId: input.avatarId, width: faceW, height: faceH, modelRef },
    });

    const storage = getStorage();
    const rel = `${projectPaths(input.projectId).avatar}/face.png`;
    const stored = await storage.put({ path: rel, data: artifact.data, mime: artifact.mime });

    return {
      kind: artifact.kind,
      provider: this.name,
      model: artifact.model,
      path: stored.path,
      width: faceW,
      height: faceH,
      meta: { ...artifact.meta, bytes: stored.bytes, via: gpu.name },
    };
  }
}
