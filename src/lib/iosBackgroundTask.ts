import { NativeModules, Platform } from "react-native";

type BackgroundTaskNativeModule = {
  begin: (name: string) => Promise<number>;
  end: (taskId: number) => Promise<boolean>;
};

const nativeModule = NativeModules.DaimokuBackgroundTaskModule as BackgroundTaskNativeModule | undefined;

function canUseModule() {
  return Platform.OS === "ios" && Boolean(nativeModule);
}

export async function beginIosBackgroundTask(name: string): Promise<number | null> {
  if (!canUseModule()) return null;

  try {
    const taskId = await nativeModule!.begin(name);
    return typeof taskId === "number" && taskId >= 0 ? taskId : null;
  } catch {
    return null;
  }
}

export async function endIosBackgroundTask(taskId: number | null | undefined): Promise<void> {
  if (!canUseModule() || taskId == null) return;

  try {
    await nativeModule!.end(taskId);
  } catch {
    // ignore
  }
}
