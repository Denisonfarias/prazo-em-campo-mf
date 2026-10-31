import type { WhatsAppConfig, WhatsAppProvider } from "@/lib/types";

export type EffectiveWhatsApp = {
  provider: WhatsAppProvider;
  source: "ambiente" | "painel" | "nenhuma";
  metaToken: string;
  metaPhoneNumberId: string;
  webhookUrl: string;
  webhookToken: string;
};

export function effectiveWhatsapp(config: WhatsAppConfig): EffectiveWhatsApp {
  const envToken = process.env.WHATSAPP_TOKEN?.trim() ?? "";
  const envPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? "";
  const envWebhook = process.env.WHATSAPP_WEBHOOK_URL?.trim() ?? "";
  const envWebhookToken = process.env.WHATSAPP_WEBHOOK_TOKEN?.trim() ?? "";

  if (envToken && envPhoneId) {
    return {
      provider: "meta",
      source: "ambiente",
      metaToken: envToken,
      metaPhoneNumberId: envPhoneId,
      webhookUrl: "",
      webhookToken: "",
    };
  }
  if (envWebhook) {
    return {
      provider: "webhook",
      source: "ambiente",
      metaToken: "",
      metaPhoneNumberId: "",
      webhookUrl: envWebhook,
      webhookToken: envWebhookToken,
    };
  }
  if (config.provider === "meta" && config.metaToken && config.metaPhoneNumberId) {
    return { ...config, provider: "meta", source: "painel" };
  }
  if (config.provider === "webhook" && config.webhookUrl) {
    return { ...config, provider: "webhook", source: "painel" };
  }
  return {
    provider: "none",
    source: "nenhuma",
    metaToken: "",
    metaPhoneNumberId: "",
    webhookUrl: "",
    webhookToken: "",
  };
}

export function isWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

export async function sendWhatsApp(
  config: EffectiveWhatsApp,
  phone: string,
  message: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (config.provider === "meta") return await sendMeta(config, phone, message);
    if (config.provider === "webhook") return await sendWebhook(config, phone, message);
    return { ok: false, error: "WhatsApp não configurado" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Falha ao enviar WhatsApp",
    };
  }
}

async function sendMeta(
  config: EffectiveWhatsApp,
  phone: string,
  message: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${config.metaPhoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.metaToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "text",
        text: { preview_url: true, body: message },
      }),
      signal: AbortSignal.timeout(15000),
    },
  );
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    return {
      ok: false,
      error: payload?.error?.message || `Meta respondeu ${response.status}`,
    };
  }
  return { ok: true };
}

async function sendWebhook(
  config: EffectiveWhatsApp,
  phone: string,
  message: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.webhookToken) {
    headers.Authorization = `Bearer ${config.webhookToken}`;
    if (config.webhookUrl.includes("z-api.io")) {
      headers["Client-Token"] = config.webhookToken;
    }
  }
  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      phone,
      number: phone,
      message,
      text: message,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 280);
    return {
      ok: false,
      error: detail || `Webhook respondeu ${response.status}`,
    };
  }
  return { ok: true };
}
