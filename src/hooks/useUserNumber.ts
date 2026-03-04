import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/src/lib/supabase";

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const useUserNumber = () => {
  const [userNumber, setUserNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeUserNumber = async () => {
      try {
        // キャッシュから読み込み
        const cachedUserNumber = await AsyncStorage.getItem("@user_number");
        if (cachedUserNumber) {
          setUserNumber(parseInt(cachedUserNumber, 10));
          setLoading(false);
          return;
        }

        // デバイスIDを取得or生成
        let deviceId = await AsyncStorage.getItem("@device_id");
        if (!deviceId) {
          deviceId = generateUUID();
          await AsyncStorage.setItem("@device_id", deviceId);
        }

        // Supabaseにupsert
        const { data } = await supabase
          .from("user_registrations")
          .upsert({ device_id: deviceId }, { onConflict: "device_id" })
          .select("id")
          .single();

        if (data?.id) {
          setUserNumber(data.id);
          await AsyncStorage.setItem("@user_number", data.id.toString());
        }
      } catch (error) {
        console.error("Failed to initialize user number:", error);
      } finally {
        setLoading(false);
      }
    };

    initializeUserNumber();
  }, []);

  return { userNumber, loading };
};
