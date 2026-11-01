import { SHEET_EDIT_URL } from "@/lib/config";
import { buildMessage, inAlertWindow, recipientsFor } from "@/lib/domain";
import { fetchPhoneSheet } from "@/lib/phones";
import { locked } from "@/lib/store";
import type { AlertStatus, Delivery, Service, StoreData } from "@/lib/types";
import { effectiveWhatsapp, sendWhatsApp } from "@/lib/whatsapp";

const PHONE_TTL_MS = 2 * 60 * 1000;

export async function refreshPhones(force = false) {
  return locked(async (store) => {
    await refreshPhonesIfStale(store, force);
    return {
      phones: store.phones,
      phonesFetchedAt: store.phonesFetchedAt,
      phonesError: store.phonesError,
    };
  });
}

export async function saveServices(fileName: string, services: Service[]) {
  return locked(async (store) => {
    store.fileName = fileName;
    store.uploadedAt = new Date().toISOString();
    store.services = services;
    const keys = new Set(services.map((service) => `${service.codigoTdc}|${service.prazoIso}`));
    store.alerts = store.alerts.filter((alert) => keys.has(alert.key));
    return { count: services.length };
  });
}

export async function saveSettings(input: {
  extraOwnerPhone?: string;
  provider?: "none" | "meta" | "webhook";
  metaToken?: string;
  metaPhoneNumberId?: string;
  webhookUrl?: string;
  webhookToken?: string;
}) {
  return locked(async (store) => {
    if (typeof input.extraOwnerPhone === "string") {
      store.extraOwnerPhone = input.extraOwnerPhone.trim();
    }
    if (input.provider) store.whatsapp.provider = input.provider;
    if (typeof input.metaPhoneNumberId === "string") {
      store.whatsapp.metaPhoneNumberId = input.metaPhoneNumberId.trim();
    }
    if (typeof input.webhookUrl === "string") {
      store.whatsapp.webhookUrl = input.webhookUrl.trim();
    }
    if (input.metaToken?.trim()) store.whatsapp.metaToken = input.metaToken.trim();
    if (input.webhookToken?.trim()) store.whatsapp.webhookToken = input.webhookToken.trim();
    return publicSettings(store);
  });
}

export async function runAlertCheck() {
  return locked(async (store) => {
    try {
      await refreshPhonesIfStale(store, false);
      const result = await dispatchDueAlerts(store, Date.now());
      store.lastCheckAt = new Date().toISOString();
      store.lastCheckError = null;
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha na varredura";
      store.lastCheckAt = new Date().toISOString();
      store.lastCheckError = message;
      return { sent: 0, prepared: 0, services: store.services.length, error: message };
    }
  });
}

export async function sendTestMessage() {
  return locked(async (store) => {
    await refreshPhonesIfStale(store, false);
    const config = effectiveWhatsapp(store.whatsapp);
    if (config.provider === "none") {
      throw new Error("Configure o WhatsApp antes de enviar o teste.");
    }
    const owners = recipientsFor(
      { chefe: "" },
      store.phones,
      store.extraOwnerPhone,
    ).filter((recipient) => recipient.papel === "responsavel");
    if (!owners.length) {
      throw new Error(
        "Não achei o seu número. Na planilha, preencha a coluna mais_informacoes com meu numero, ou informe um número adicional.",
      );
    }
    const message =
      "Teste do acompanhamento de prazos. Se você recebeu esta mensagem, o aviso automático de uma hora está funcionando.";
    const results: { nome: string; phone: string; ok: boolean; error?: string }[] = [];
    for (const owner of owners) {
      const sent = await sendWhatsApp(config, owner.phone, message);
      results.push({
        nome: owner.nome,
        phone: owner.phone,
        ok: sent.ok,
        error: sent.ok ? undefined : sent.error,
      });
    }
    if (results.every((result) => !result.ok)) {
      throw new Error(results[0]?.error || "O teste não foi enviado.");
    }
    return { results };
  });
}

async function refreshPhonesIfStale(store: StoreData, force: boolean) {
  const fetchedAt = store.phonesFetchedAt ? Date.parse(store.phonesFetchedAt) : 0;
  const fresh = Date.now() - fetchedAt < PHONE_TTL_MS;
  if (!force && fresh && !store.phonesError) return;
  try {
    store.phones = await fetchPhoneSheet();
    store.phonesFetchedAt = new Date().toISOString();
    store.phonesError = null;
  } catch (error) {
    store.phonesError =
      error instanceof Error ? error.message : "Falha ao ler a planilha de telefones";
  }
}

export async function dispatchDueAlerts(store: StoreData, now: number) {
  const config = effectiveWhatsapp(store.whatsapp);
  let sent = 0;
  let prepared = 0;
  if (config.provider === "none") {
    return { sent, prepared, services: store.services.length };
  }

  for (const service of store.services) {
    if (!inAlertWindow(service.prazoIso, now)) continue;
    prepared += 1;
    const key = alertKey(service);
    let alert = store.alerts.find((item) => item.key === key);
    const recipients = recipientsFor(service, store.phones, store.extraOwnerPhone);
    const message = buildMessage(service, now);

    if (!alert) {
      alert = {
        id: `${now}-${service.id}`,
        key,
        codigoTdc: service.codigoTdc,
        prazoIso: service.prazoIso,
        cliente: service.cliente,
        chefe: service.chefe,
        endereco: service.endereco,
        message,
        status: "sem_destinatario",
        deliveries: [],
        updatedAt: new Date(now).toISOString(),
      };
      store.alerts.push(alert);
    }
    alert.message = message;
    alert.cliente = service.cliente;
    alert.chefe = service.chefe;
    alert.endereco = service.endereco;

    if (!recipients.length) {
      alert.status = "sem_destinatario";
      alert.updatedAt = new Date(now).toISOString();
      continue;
    }

    for (const recipient of recipients) {
      const previous = alert.deliveries.find((item) => item.phone === recipient.phone);
      if (previous?.status === "enviado") continue;

      let status: Delivery["status"];
      let error: string | undefined;
      const result = await sendWhatsApp(config, recipient.phone, message);
      if (result.ok) {
        status = "enviado";
        sent += 1;
      } else {
        status = "falhou";
        error = result.error;
      }

      const delivery: Delivery = {
        papel: recipient.papel,
        nome: recipient.nome,
        phone: recipient.phone,
        status,
        error,
        at: new Date().toISOString(),
      };
      const index = alert.deliveries.findIndex((item) => item.phone === recipient.phone);
      if (index >= 0) alert.deliveries[index] = delivery;
      else alert.deliveries.push(delivery);
    }

    alert.status = summarize(alert.deliveries);
    alert.updatedAt = new Date().toISOString();
  }

  return { sent, prepared, services: store.services.length };
}

function alertKey(service: Service): string {
  return `${service.codigoTdc}|${service.prazoIso}`;
}

function summarize(deliveries: Delivery[]): AlertStatus {
  if (!deliveries.length) return "sem_destinatario";
  const sent = deliveries.filter((item) => item.status === "enviado").length;
  const failed = deliveries.filter((item) => item.status === "falhou").length;
  const waiting = deliveries.filter((item) => item.status === "sem_whatsapp").length;
  if (sent === deliveries.length) return "enviado";
  if (waiting && !failed && !sent) return "sem_whatsapp";
  if (failed && !sent) return "falhou";
  return "parcial";
}

export function publicSettings(store: StoreData) {
  const effective = effectiveWhatsapp(store.whatsapp);
  return {
    extraOwnerPhone: store.extraOwnerPhone,
    provider: store.whatsapp.provider,
    metaPhoneNumberId: store.whatsapp.metaPhoneNumberId,
    webhookUrl: store.whatsapp.webhookUrl,
    hasMetaToken: Boolean(store.whatsapp.metaToken),
    hasWebhookToken: Boolean(store.whatsapp.webhookToken),
    activeProvider: effective.provider,
    activeSource: effective.source,
  };
}

export function publicState(store: StoreData) {
  const settings = publicSettings(store);
  return {
    now: new Date().toISOString(),
    fileName: store.fileName,
    uploadedAt: store.uploadedAt,
    services: store.services,
    alerts: [...store.alerts].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    phones: store.phones,
    phonesFetchedAt: store.phonesFetchedAt,
    phonesError: store.phonesError,
    lastCheckAt: store.lastCheckAt,
    lastCheckError: store.lastCheckError,
    sheetUrl: SHEET_EDIT_URL,
    settings,
  };
}
