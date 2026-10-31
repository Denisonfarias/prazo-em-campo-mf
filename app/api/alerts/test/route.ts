import { sendTestMessage } from "@/lib/alerts";

export async function POST() {
  try {
    const result = await sendTestMessage();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "O teste não foi enviado.";
    return Response.json({ error: message }, { status: 400 });
  }
}
