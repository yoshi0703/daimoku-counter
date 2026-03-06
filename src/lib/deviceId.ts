import AsyncStorage from "@react-native-async-storage/async-storage";

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let cachedDeviceId: string | null = null;
let pendingPromise: Promise<string> | null = null;

export function getOrCreateDeviceId(): Promise<string> {
  if (cachedDeviceId) return Promise.resolve(cachedDeviceId);
  if (!pendingPromise) {
    pendingPromise = (async () => {
      try {
        let deviceId = await AsyncStorage.getItem("@device_id");
        if (!deviceId) {
          deviceId = generateUUID();
          await AsyncStorage.setItem("@device_id", deviceId);
        }
        cachedDeviceId = deviceId;
        return deviceId;
      } finally {
        pendingPromise = null;
      }
    })();
  }
  return pendingPromise;
}