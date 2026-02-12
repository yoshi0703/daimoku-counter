import * as FileSystem from "expo-file-system/legacy";

export type TranscriptionProvider = "deepgram" | "openai";

interface TranscriptionResult {
  transcript: string;
  success: boolean;
  error?: string;
}

/**
 * Deepgram Nova-3 で音声ファイルを文字起こし
 */
async function transcribeWithDeepgram(
  audioUri: string,
  apiKey: string,
): Promise<TranscriptionResult> {
  try {
    const response = await FileSystem.uploadAsync(
      "https://api.deepgram.com/v1/listen?model=nova-3&language=ja&punctuate=false&smart_format=false",
      audioUri,
      {
        headers: {
          Authorization: `Token ${apiKey}`,
        },
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        mimeType: "audio/m4a",
      },
    );

    if (response.status !== 200) {
      return { transcript: "", success: false, error: `Deepgram error: ${response.status}` };
    }

    const data = JSON.parse(response.body);
    const transcript =
      data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    return { transcript, success: true };
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
      return { transcript: "", success: false, error: `OpenAI error: ${response.status}` };
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
): Promise<TranscriptionResult> {
  // Deepgram を優先
  if (deepgramKey) {
    const result = await transcribeWithDeepgram(audioUri, deepgramKey);
    if (result.success) return result;
    // Deepgram 失敗 → OpenAI にフォールバック
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
