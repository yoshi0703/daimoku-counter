import { NativeModules, Platform } from "react-native";

type LiveActivityPayload = {
  sessionId?: string;
  startedAt?: string;
  targetCount?: number;
  count?: number;
  elapsedSeconds?: number;
  mode?: string;
  todayTotal?: number;
  updatedAt?: string;
  isRecording?: boolean;
};

type LiveActivityNativeModule = {
  isSupported: () => Promise<boolean>;
  start: (payload: LiveActivityPayload) => Promise<string | null>;
  update: (activityId: string, payload: LiveActivityPayload) => Promise<boolean>;
  stop: (activityId: string, payload: LiveActivityPayload) => Promise<boolean>;
  syncWidgetSnapshot: (payload: LiveActivityPayload) => Promise<boolean>;
};

const nativeModule = NativeModules.DaimokuLiveActivityModule as LiveActivityNativeModule | undefined;

function canUseModule() {
  return Platform.OS === "ios" && Boolean(nativeModule);
}

export async function isDaimokuLiveActivitySupported(): Promise<boolean> {
  if (!canUseModule()) return false;

  try {
    return await nativeModule!.isSupported();
  } catch {
    return false;
  }
}

export async function startDaimokuLiveActivity(payload: LiveActivityPayload): Promise<string | null> {
  if (!canUseModule()) return null;

  try {
    return await nativeModule!.start(payload);
  } catch {
    return null;
  }
}

export async function updateDaimokuLiveActivity(activityId: string, payload: LiveActivityPayload): Promise<boolean> {
  if (!canUseModule()) return false;

  try {
    return await nativeModule!.update(activityId, payload);
  } catch {
    return false;
  }
}

export async function stopDaimokuLiveActivity(activityId: string, payload: LiveActivityPayload): Promise<boolean> {
  if (!canUseModule()) return false;

  try {
    return await nativeModule!.stop(activityId, payload);
  } catch {
    return false;
  }
}

export async function syncDaimokuWidgetSnapshot(payload: LiveActivityPayload): Promise<boolean> {
  if (!canUseModule()) return false;

  try {
    return await nativeModule!.syncWidgetSnapshot(payload);
  } catch {
    return false;
  }
}
