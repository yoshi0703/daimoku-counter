import * as FileSystem from "expo-file-system/legacy";

export type TranscriptionProvider = "deepgram" | "openai";

interface TranscriptionResult {
  transcript: string;
  success: boolean;
  error?: string;
  /** search パラメータによる音響マッチング件数 */
  searchHits?: number;
}

/**
 * Deepgram Nova-3 APIのURLを構築。
 * keyterm（キーターム認識ブースト）と search（音響パターンマッチング）を使用。
 */
function buildDeepgramUrl(): string {
  const params = new URLSearchParams({
    model: "nova-3",
    language: "ja",
    punctuate: "true",
    smart_format: "false",
    utterances: "true",
  });

  // Nova-3 専用: keyterm 認識ブースト（最大90%精度向上）
  // keywords パラメータは Nova-2 以前専用なので使わない
  const keyterms = [
    "南無妙法蓮華経",
    "なんみょうほうれんげきょう",
    "なむみょうほうれんげきょう",
  ];
  keyterms.forEach((term) => params.append("keyterm", term));

  // 音響パターンマッチング: テキストマッチより正確にカウント可能
  params.append("search", "南無妙法蓮華経");

  return `https://api.deepgram.com/v1/listen?${params.toString()}`;
}

/**
 * Deepgram Nova-3 で音声ファイルを文字起こし
 */
async function transcribeWithDeepgram(
  audioUri: string,
  apiKey: string,
  isJwt = false,
): Promise<TranscriptionResult> {
  try {
    const url = buildDeepgramUrl();

    // 永続キーは "Token xxx"、JWT は "Bearer xxx" で認証
    const authHeader = isJwt
      ? `Bearer ${apiKey}`
      : `Token ${apiKey}`;

    const response = await FileSystem.uploadAsync(url, audioUri, {
      headers: {
        Authorization: authHeader,
      },
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      mimeType: "audio/m4a",
    });

    if (response.status !== 200) {
      return {
        transcript: "",
        success: false,
        error: `Deepgram error: ${response.status} ${response.body?.slice(0, 200)}`,
      };
    }

    const data = JSON.parse(response.body);
    const transcript =
      data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";

    // search 結果から音響マッチング件数を取得
    const searchResults = data?.results?.channels?.[0]?.search?.results;
    let searchHits = 0;
    if (searchResults && Array.isArray(searchResults)) {
      for (const result of searchResults) {
        if (result.hits && Array.isArray(result.hits)) {
          searchHits += result.hits.length;
        }
      }
    }

    return { transcript, success: true, searchHits };
  } catch (e: any) {
    return { transcript: "", success: false, error: e.message };
  }
}

/**
 * OpenAI GPT-4o Mini Transcribe で音声ファイルを文字起こし
 */
async function transcribeWithOpenAI(
  audioUri: string,
  apiKey: string,
): Promise<TranscriptionResult> {
  try {
    const response = await FileSystem.uploadAsync(
      "https://api.openai.com/v1/audio/transcriptions",
      audioUri,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: "file",
        mimeType: "audio/m4a",
        parameters: {
          model: "gpt-4o-mini-transcribe",
          language: "ja",
        },
      },
    );

    if (response.status !== 200) {
      return {
        transcript: "",
        success: false,
        error: `OpenAI error: ${response.status}`,
      };
    }

    const data = JSON.parse(response.body);
    return { transcript: data?.text ?? "", success: true };
  } catch (e: any) {
    return { transcript: "", success: false, error: e.message };
  }
}

/**
 * 設定されたプロバイダーで文字起こしを実行。
 * Deepgram 失敗時は OpenAI にフォールバック。
 */
export async function transcribeAudio(
  audioUri: string,
  deepgramKey: string | null,
  openaiKey: string | null,
  deepgramToken?: string | null,
): Promise<TranscriptionResult> {
  // JWT トークンがあればそちらを優先
  if (deepgramToken) {
    const result = await transcribeWithDeepgram(audioUri, deepgramToken, true);
    if (result.success) return result;
    console.warn("Deepgram token auth failed, trying key:", result.error);
  }

  // 永続キーで試行
  if (deepgramKey) {
    const result = await transcribeWithDeepgram(audioUri, deepgramKey);
    if (result.success) return result;
    console.warn("Deepgram failed, falling back to OpenAI:", result.error);
  }

  // OpenAI フォールバック
  if (openaiKey) {
    return transcribeWithOpenAI(audioUri, openaiKey);
  }

  return {
    transcript: "",
    success: false,
    error: "APIキーが設定されていません",
  };
}
