/**
 * MOCK ScriptProvider. Rule-based normalisation + segmentation + a few sanity
 * warnings. No model. Real script analysis (pronunciation hints, pacing, Swahili
 * checks) is Phase 3.
 *
 * When a PRODUCTION speaking_style profile exists (brief §8.3 — sentence
 * length, wpm, pause/opener/closer patterns learned from the founder's own
 * transcribed videos), reshapes the script toward the founder's natural
 * sentence rhythm before segmenting — "new script -> founder-like delivery"
 * without needing a paid LLM API: this is a straight statistical reshaping,
 * not a generative rewrite, deliberately kept that way (brief §8.1 — don't
 * reach for a bigger/costlier tool than the job needs).
 */
import { productionVersion } from "../../training/repo";
import type { ScriptAnalysis, ScriptProvider, ScriptSegment } from "../types";

const WORDS_PER_SECOND = 2.3; // rough Swahili narration pace for estimates

interface StyleProfile {
  avg_sentence_words?: number;
  words_per_minute?: number;
}

/** Split `text` into chunks close to the founder's own average sentence
 * length — the same rule gpu_worker.py's _apply_style applies for the
 * speaking_style evaluation preview, kept in sync deliberately. */
function applyStyle(text: string, profile: StyleProfile): string {
  const target = profile.avg_sentence_words ?? 0;
  const words = text.split(/\s+/).filter(Boolean);
  if (!target || target < 3 || words.length <= target * 1.3) return text;
  const size = Math.max(3, Math.round(target));
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += size) chunks.push(words.slice(i, i + size).join(" "));
  return chunks.map((c) => c.replace(/[.\s]+$/, "")).filter(Boolean).join(". ") + ".";
}

export class MockScriptProvider implements ScriptProvider {
  readonly name = "mock";

  async analyze(input: { text: string }): Promise<ScriptAnalysis> {
    let normalizedText = input.text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
    const warnings: string[] = [];
    if (normalizedText.length === 0) warnings.push("Script is empty.");
    if (normalizedText.length > 6000)
      warnings.push("Script is very long (>6000 chars); consider splitting.");
    if (/[<>{}]/.test(normalizedText)) warnings.push("Script contains markup-like characters.");

    const style = productionVersion("speaking_style");
    const styleProfile = style?.config?.styleProfile as StyleProfile | undefined;
    let styled = false;
    if (styleProfile && normalizedText.length > 0) {
      const reshaped = applyStyle(normalizedText, styleProfile);
      if (reshaped !== normalizedText) {
        normalizedText = reshaped;
        styled = true;
      }
    }

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
      kind: styled ? "EXPERIMENTAL" : "MOCK",
      provider: this.name,
      model: styled ? "speaking-style-v1 (rule-based)" : "rules-v1",
      normalizedText,
      segments,
      totalEstSeconds,
      warnings,
      meta: {
        sentenceCount: segments.length,
        ...(styled ? { styledToFounderPace: true, avgSentenceWords: styleProfile?.avg_sentence_words } : {}),
      },
    };
  }
}
