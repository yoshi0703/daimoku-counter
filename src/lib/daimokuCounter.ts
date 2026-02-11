const VARIANTS = [
  "南無妙法蓮華経",
  "なむみょうほうれんげきょう",
  "ナムミョウホウレンゲキョウ",
  "なむみょうほうれんげーきょう",
  "ナムミョウホウレンゲーキョウ",
];

/**
 * テキスト中の対象フレーズの出現回数をカウント。
 * 全バリアントを試し、最大カウントを返す。
 */
export function countOccurrences(text: string): number {
  const normalized = text.replace(/\s+/g, "").replace(/[、。,.\-]/g, "");

  let maxCount = 0;
  for (const variant of VARIANTS) {
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
