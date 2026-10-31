import { runAlertCheck } from "@/lib/alerts";

export async function POST() {
  const result = await runAlertCheck();
  if ("error" in result && result.error) {
    return Response.json(result, { status: 500 });
  }
  return Response.json({ ok: true, ...result });
}
