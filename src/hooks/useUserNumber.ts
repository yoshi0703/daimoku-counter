import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/src/lib/supabase";
import { getOrCreateDeviceId } from "@/src/lib/deviceId";

export const useUserNumber = () => {
  const [userNumber, setUserNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeUserNumber = async () => {
      try {
        const cachedUserNumber = await AsyncStorage.getItem("@user_number");
        if (cachedUserNumber) {
          setUserNumber(parseInt(cachedUserNumber, 10));
          setLoading(false);
          return;
        }

        const deviceId = await getOrCreateDeviceId();

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
