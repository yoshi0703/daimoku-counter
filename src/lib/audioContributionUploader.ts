import { Platform } from "react-native";
import Constants from "expo-constants";
import { File } from "expo-file-system";
import { supabase } from "./supabase";

interface AudioContributionParams {
  uri: string;
  durationSeconds: number;
  daimokuCount: number;
  recognitionMode: string;
}

export async function uploadAudioContribution(
  params: AudioContributionParams,
): Promise<void> {
  const { uri, durationSeconds, daimokuCount, recognitionMode } = params;

  try {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).slice(2, 10);
    const fileName = `${timestamp}_${randomSuffix}.m4a`;
    const storagePath = `contributions/${fileName}`;

    const file = new File(uri);
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("audio-contributions")
      .upload(storagePath, arrayBuffer, {
        contentType: "audio/mp4",
        upsert: false,
      });

    if (uploadError) {
      console.warn("Audio contribution upload failed:", uploadError.message);
      return;
    }

    const { error: insertError } = await supabase
      .from("audio_contributions")
      .insert({
        storage_path: storagePath,
        duration_seconds: durationSeconds,
        daimoku_count: daimokuCount,
        recognition_mode: recognitionMode,
        platform: Platform.OS,
        app_version: Constants.expoConfig?.version ?? null,
      });

    if (insertError) {
      console.warn(
        "Audio contribution metadata insert failed:",
        insertError.message,
      );
    }
  } catch (error) {
    console.warn("Audio contribution error:", error);
  }
}
