import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/src/lib/supabase";

type PushEvent = "update" | "end";

type PushContentState = {
  count: number;
  elapsedSeconds: number;
  mode: string;
  todayTotal: number;
};

type RelayParams = {
  pushToken: string;
  event: PushEvent;
  contentState: PushContentState;
  staleDate?: number;
  dismissalDate?: number;
};

export async function relayLiveActivityPush(params: RelayParams): Promise<boolean> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/live-activity-push`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    return response.ok;
  } catch {
    return false;
  }
}
