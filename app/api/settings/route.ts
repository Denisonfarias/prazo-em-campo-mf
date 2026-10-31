import { saveSettings } from "@/lib/alerts";
import { isWebhookUrl } from "@/lib/whatsapp";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    extraOwnerPhone?: string;
    provider?: "none" | "meta" | "webhook";
    metaToken?: string;
    metaPhoneNumberId?: string;
    webhookUrl?: string;
    webhookToken?: string;
  } | null;

  if (!body) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  if (body.provider && !["none", "meta", "webhook"].includes(body.provider)) {
    return Response.json({ error: "Provedor de WhatsApp inválido." }, { status: 400 });
  }
  if (body.provider === "webhook" && body.webhookUrl && !isWebhookUrl(body.webhookUrl)) {
    return Response.json(
      { error: "A URL do webhook precisa começar com https://." },
      { status: 400 },
    );
  }

  const settings = await saveSettings(body);
  return Response.json({ ok: true, settings });
}
