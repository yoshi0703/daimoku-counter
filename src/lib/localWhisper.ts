import { Platform, TurboModuleRegistry } from "react-native";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";

type WhisperModuleType = {
  initWhisper: (options: {
    filePath: string;
    useGpu?: boolean;
    useCoreMLIos?: boolean;
    useFlashAttn?: boolean;
  }) => Promise<{
    transcribe: (
      filePath: string,
      options?: {
        language?: string;
        translate?: boolean;
        maxThreads?: number;
      },
    ) => {
      stop: () => Promise<void>;
      promise: Promise<{
        result: string;
        isAborted: boolean;
      }>;
    };
  }>;
  releaseAllWhisper?: () => Promise<void>;
};

type WhisperWarmupResult =
  | { success: true; downloaded: boolean }
  | { success: false; error: string };

type WhisperTranscriptionResult =
  | { success: true; transcript: string }
  | { success: false; error: string };

const MODEL_NAME = "ggml-tiny.bin";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const BUNDLED_MODEL_MODULE = require("../../assets/whisper/ggml-tiny.bin");
const ROOT_DIR = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory}whisper`;
const MODEL_PATH = `${ROOT_DIR}/${MODEL_NAME}`;

let WhisperModule: WhisperModuleType | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  WhisperModule = require("whisper.rn");
} catch {
  WhisperModule = null;
}

let whisperContextPromise: Promise<Awaited<ReturnType<WhisperModuleType["initWhisper"]>>> | null = null;

async function ensureModelFile(): Promise<{ path: string; downloaded: boolean }> {
  const bundledModel = Asset.fromModule(BUNDLED_MODEL_MODULE);
  let downloaded = false;
  if (!bundledModel.localUri) {
    await bundledModel.downloadAsync();
    downloaded = true;
  }
  if (bundledModel.localUri) {
    return { path: bundledModel.localUri, downloaded };
  }

  // 後方互換: 旧バージョンのランタイム配置済みモデルがあれば利用
  const existing = await FileSystem.getInfoAsync(MODEL_PATH);
  if (existing.exists && (existing.size ?? 0) > 0) {
    return { path: MODEL_PATH, downloaded: false };
  }

  throw new Error("Whisperモデルが同梱されていません。アプリを再インストールしてください。");
}

async function getWhisperContext() {
  if (!WhisperModule) {
    throw new Error("Whisperネイティブモジュールが利用できません");
  }

  if (!whisperContextPromise) {
    whisperContextPromise = (async () => {
      const { path } = await ensureModelFile();
      return WhisperModule!.initWhisper({
        filePath: path,
        useGpu: true,
        useCoreMLIos: true,
        useFlashAttn: true,
      });
    })();

    try {
      await whisperContextPromise;
    } catch (error) {
      whisperContextPromise = null;
      throw error;
    }
  }

  return whisperContextPromise;
}

export function isLocalWhisperSupported(): boolean {
  if (Platform.OS !== "ios" || WhisperModule == null) return false;

  try {
    return Boolean(TurboModuleRegistry.get("RNWhisper"));
  } catch {
    return false;
  }
}

export async function warmupLocalWhisper(): Promise<WhisperWarmupResult> {
  if (!isLocalWhisperSupported()) {
    return { success: false, error: "この環境ではWhisperを利用できません" };
  }

  try {
    const { downloaded } = await ensureModelFile();
    await getWhisperContext();
    return { success: true, downloaded };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message ?? "Whisper初期化エラー",
    };
  }
}

export async function transcribeWithLocalWhisper(
  audioUri: string,
): Promise<WhisperTranscriptionResult> {
  if (!isLocalWhisperSupported()) {
    return { success: false, error: "この環境ではWhisperを利用できません" };
  }

  try {
    const context = await getWhisperContext();
    const { promise } = context.transcribe(audioUri, {
      language: "ja",
      translate: false,
      maxThreads: 4,
    });
    const { result, isAborted } = await promise;

    if (isAborted) {
      return { success: false, error: "Whisper処理が中断されました" };
    }

    return { success: true, transcript: (result ?? "").trim() };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message ?? "Whisper文字起こしエラー",
    };
  }
}

export async function releaseLocalWhisperContext(): Promise<void> {
  if (!WhisperModule?.releaseAllWhisper) return;
  try {
    await WhisperModule.releaseAllWhisper();
  } catch {
    // ignore
  } finally {
    whisperContextPromise = null;
  }
}
