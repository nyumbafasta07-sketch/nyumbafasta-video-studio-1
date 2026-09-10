/**
 * MOCK ScriptProvider. Rule-based normalisation + segmentation + a few sanity
 * warnings. No model. Real script analysis (pronunciation hints, pacing, Swahili
 * checks) is Phase 3.
 */
import type { ScriptAnalysis, ScriptProvider, ScriptSegment } from "../types";

const WORDS_PER_SECOND = 2.3; // rough Swahili narration pace for estimates

export class MockScriptProvider implements ScriptProvider {
  readonly name = "mock";

  async analyze(input: { text: string }): Promise<ScriptAnalysis> {
    const normalizedText = input.text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
    const warnings: string[] = [];
    if (normalizedText.length === 0) warnings.push("Script is empty.");
    if (normalizedText.length > 6000)
      warnings.push("Script is very long (>6000 chars); consider splitting.");
    if (/[<>{}]/.test(normalizedText)) warnings.push("Script contains markup-like characters.");

    const sentences = normalizedText
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const segments: ScriptSegment[] = sentences.map((text, index) => {
      const words = text.split(/\s+/).filter(Boolean).length;
      return { index, text, estSeconds: Math.max(0.6, words / WORDS_PER_SECOND) };
    });

    const totalEstSeconds =
      segments.reduce((a, s) => a + s.estSeconds, 0) ||
      Math.max(1, normalizedText.split(/\s+/).filter(Boolean).length / WORDS_PER_SECOND);

    return {
      kind: "MOCK",
      provider: this.name,
      model: "rules-v1",
      normalizedText,
      segments,
      totalEstSeconds,
      warnings,
      meta: { sentenceCount: segments.length },
    };
  }
}
