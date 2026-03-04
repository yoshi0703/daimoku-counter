import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/src/lib/supabase";
import { getOrCreateDeviceId } from "@/src/lib/deviceId";

const MIGRATION_KEY = "@device_id_migration_done";

export async function migrateOrphanedRows(): Promise<void> {
  try {
    const done = await AsyncStorage.getItem(MIGRATION_KEY);
    if (done) return;

    const deviceId = await getOrCreateDeviceId();

    await Promise.all([
      supabase
        .from("daimoku_sessions")
        .update({ device_id: deviceId })
        .is("device_id", null),
      supabase
        .from("daimoku_goals")
        .update({ device_id: deviceId })
        .is("device_id", null),
    ]);

    await AsyncStorage.setItem(MIGRATION_KEY, "1");
  } catch (error) {
    console.error("Failed to migrate orphaned rows:", error);
  }
}
