export const DAIMOKU_VARIANTS = [
  "南無妙法蓮華経",
  "なむみょうほうれんげきょう",
  "ナムミョウホウレンゲキョウ",
  "なむみょうほうれんげーきょう",
  "ナムミョウホウレンゲーキョウ",
  // Deepgram が返す可能性のあるバリエーション
  "なんみょうほうれんげきょう",
  "ナンミョウホウレンゲキョウ",
  "なんみょうほうれんげーきょう",
  "なむみょーほーれんげきょー",
  "なむみょーほーれんげーきょー",
  "南無妙法蓮華経",  // 全角
];

const DAIMOKU_CONTEXTUAL_STRINGS = Array.from(
  new Set([
    ...DAIMOKU_VARIANTS,
    "南無 妙法 蓮華経",
    "なむ みょうほうれんげきょう",
    "なむ みょう ほう れん げ きょう",
    "ナム ミョウホウレンゲキョウ",
    "なんみょうほうれんげきょう",
    "なん みょう ほう れん げ きょう",
  ]),
);

type RecognitionResultLike = {
  transcript?: string | null;
  confidence?: number;
};

/**
 * テキスト中の対象フレーズの出現回数をカウント。
 * 全バリアントを試し、最大カウントを返す。
 */
export function countOccurrences(text: string): number {
  const normalized = text.replace(/\s+/g, "").replace(/[、。,.\-]/g, "");

  let maxCount = 0;
  for (const variant of DAIMOKU_VARIANTS) {
    let count = 0;
    let searchFrom = 0;
    while (true) {
      const idx = normalized.indexOf(variant, searchFrom);
      if (idx === -1) break;
      count++;
      searchFrom = idx + variant.length;
    }
    maxCount = Math.max(maxCount, count);
  }
  return maxCount;
}

/**
 * iOS/Android 音声認識エンジンの認識ヒントに渡す語彙一覧。
 */
export function getDaimokuContextualStrings(): string[] {
  return DAIMOKU_CONTEXTUAL_STRINGS;
}

/**
 * 認識候補の中から題目カウントに最も有利な transcript を選ぶ。
 * - 題目ヒット数を最優先
 * - 次点で confidence と文字数を評価
 */
export function selectBestDaimokuTranscript(
  results: RecognitionResultLike[] | undefined,
): string {
  if (!results || results.length === 0) return "";

  let bestTranscript = "";
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const result of results) {
    const transcript = result?.transcript?.trim() ?? "";
    if (!transcript) continue;

    const matchScore = countOccurrences(transcript) * 1000;
    const confidenceScore =
      typeof result.confidence === "number" && result.confidence > 0
        ? result.confidence * 10
        : 0;
    const lengthScore = Math.min(1, transcript.length / 64);
    const score = matchScore + confidenceScore + lengthScore;

    if (score > bestScore) {
      bestScore = score;
      bestTranscript = transcript;
    }
  }

  return bestTranscript || results[0]?.transcript?.trim() || "";
}

/**
 * 2層カウントアルゴリズム:
 * - finalizedCount: isFinal=true の確定結果からのカウント（減少しない）
 * - interimDelta: 現在のinterim結果からの暫定追加カウント
 * - displayCount = finalizedCount + interimDelta
 *
 * Apple SFSpeechRecognizer は interim結果を累積的に更新するため、
 * 毎回の interim で全文からカウントし直し、確定分を引いた差分のみ表示。
 */
export class DaimokuCounter {
  private finalizedCount = 0;
  private lastFinalTranscript = "";
  private currentInterimDelta = 0;

  /**
   * 音声認識の result イベントごとに呼ばれる。
   * 表示すべきカウントを返す。
   */
  processResult(transcript: string, isFinal: boolean): number {
    if (isFinal) {
      const countFromThisFinal = countOccurrences(transcript);

      if (
        this.lastFinalTranscript.length > 0 &&
        transcript.startsWith(this.lastFinalTranscript)
      ) {
        // 累積的な final: 前回との差分のみ加算
        const previousCount = countOccurrences(this.lastFinalTranscript);
        this.finalizedCount += countFromThisFinal - previousCount;
      } else {
        // 新しいセグメント: 全カウント加算
        this.finalizedCount += countFromThisFinal;
      }

      this.lastFinalTranscript = transcript;
      this.currentInterimDelta = 0;
      return this.finalizedCount;
    }

    // Interim result: 暫定デルタを計算
    const totalInInterim = countOccurrences(transcript);

    if (
      this.lastFinalTranscript.length > 0 &&
      transcript.startsWith(this.lastFinalTranscript)
    ) {
      const alreadyCounted = countOccurrences(this.lastFinalTranscript);
      this.currentInterimDelta = Math.max(0, totalInInterim - alreadyCounted);
    } else {
      this.currentInterimDelta = totalInInterim;
    }

    return this.finalizedCount + this.currentInterimDelta;
  }

  getCount(): number {
    return this.finalizedCount + this.currentInterimDelta;
  }

  /** 認識エンジンのリスタート時に呼ぶ（カウントは保持） */
  onRecognitionRestart(): void {
    this.lastFinalTranscript = "";
    this.currentInterimDelta = 0;
  }

  reset(): void {
    this.finalizedCount = 0;
    this.lastFinalTranscript = "";
    this.currentInterimDelta = 0;
  }
}
