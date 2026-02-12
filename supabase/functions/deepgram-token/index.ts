import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Deepgram 短期トークン発行 Edge Function
 *
 * 永続APIキーをサーバーサイドに保持し、
 * クライアントには短期JWT（10分有効）のみを返す。
 *
 * 環境変数: DEEPGRAM_API_KEY（Supabase Secret に設定）
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const deepgramKey = Deno.env.get("DEEPGRAM_API_KEY");
    if (!deepgramKey) {
      return new Response(
        JSON.stringify({ error: "DEEPGRAM_API_KEY not configured" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Deepgram /v1/auth/grant で短期JWTを発行
    const response = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${deepgramKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ttl_seconds: 600, // 10分
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return new Response(
        JSON.stringify({
          error: `Deepgram token error: ${response.status}`,
          detail: errorBody,
        }),
        { status: response.status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();

    return new Response(
      JSON.stringify({
        token: data.access_token,
        expires_in: data.expires_in,
      }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
