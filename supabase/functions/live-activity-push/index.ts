import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { SignJWT, importPKCS8 } from "npm:jose@5.9.6";

type PushEvent = "update" | "end";

type ContentState = {
  count: number;
  elapsedSeconds: number;
  mode: string;
  todayTotal: number;
};

type RequestBody = {
  pushToken?: string;
  event?: PushEvent;
  contentState?: ContentState;
  staleDate?: number;
  dismissalDate?: number;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

let cachedJwt: { token: string; expiresAt: number } | null = null;

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function normalizePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, "\n").trim();
}

function isValidContentState(value: unknown): value is ContentState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.count === "number" &&
    typeof candidate.elapsedSeconds === "number" &&
    typeof candidate.mode === "string" &&
    typeof candidate.todayTotal === "number"
  );
}

async function createApnsJwt(): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.expiresAt - nowSeconds > 60) {
    return cachedJwt.token;
  }

  const teamId = getRequiredEnv("APPLE_TEAM_ID");
  const keyId = getRequiredEnv("APPLE_KEY_ID");
  const privateKeyPem = normalizePrivateKey(getRequiredEnv("APPLE_PRIVATE_KEY"));
  const privateKey = await importPKCS8(privateKeyPem, "ES256");

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuedAt(nowSeconds)
    .setIssuer(teamId)
    .sign(privateKey);

  cachedJwt = {
    token,
    expiresAt: nowSeconds + 50 * 60,
  };
  return token;
}

async function sendLiveActivityPush(body: Required<Pick<RequestBody, "pushToken" | "event" | "contentState">> & Pick<RequestBody, "staleDate" | "dismissalDate">) {
  const bundleId = getRequiredEnv("APPLE_BUNDLE_ID");
  const useSandbox = (Deno.env.get("APPLE_USE_SANDBOX") ?? "true") === "true";
  const apnsHost = useSandbox
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com";

  const jwt = await createApnsJwt();

  const aps: Record<string, unknown> = {
    timestamp: Math.floor(Date.now() / 1000),
    event: body.event,
    "content-state": body.contentState,
  };

  if (body.event === "update" && typeof body.staleDate === "number") {
    aps["stale-date"] = body.staleDate;
  }
  if (body.event === "end" && typeof body.dismissalDate === "number") {
    aps["dismissal-date"] = body.dismissalDate;
  }

  const response = await fetch(`${apnsHost}/3/device/${body.pushToken}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": `${bundleId}.push-type.liveactivity`,
      "apns-push-type": "liveactivity",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify({ aps }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`APNs error ${response.status}: ${detail}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = (await req.json()) as RequestBody;
    if (!payload.pushToken || typeof payload.pushToken !== "string") {
      return new Response(JSON.stringify({ error: "pushToken is required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    if (payload.event !== "update" && payload.event !== "end") {
      return new Response(JSON.stringify({ error: "event must be update or end" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    if (!isValidContentState(payload.contentState)) {
      return new Response(JSON.stringify({ error: "invalid contentState" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    await sendLiveActivityPush({
      pushToken: payload.pushToken,
      event: payload.event,
      contentState: payload.contentState,
      staleDate: payload.staleDate,
      dismissalDate: payload.dismissalDate,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "unexpected error",
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
});
