const MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";

export default async function handler() {
  return Response.json({
    ok: true,
    model: MODEL,
    keyConfigured: Boolean(process.env.NVIDIA_API_KEY),
    accessProtectionConfigured: Boolean(process.env.SHADOW_AI_ACCESS_PASSWORD)
  }, {
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}
