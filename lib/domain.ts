import { ALERT_WINDOW_MS, SAO_PAULO_OFFSET_HOURS, TIMEZONE } from "@/lib/config";
import type { PhoneEntry, Service, Urgency } from "@/lib/types";

const prazoFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const clockFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeHeader(value: string): string {
  return normalizeName(value);
}

export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return null;
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return phone;
}

export function prazoFromParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): string | null {
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }
  const utc = new Date(
    Date.UTC(year, month - 1, day, hour + SAO_PAULO_OFFSET_HOURS, minute, second),
  );
  if (Number.isNaN(utc.getTime())) return null;
  return utc.toISOString();
}

export function prazoFromExcelSerial(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const utcMs = Math.round((serial - 25569) * 86400 * 1000);
  const date = new Date(utcMs);
  return prazoFromParts(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  );
}

export function parsePrazo(value: string): string | null {
  const text = value.trim();
  if (!text) return null;

  const brazilian = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (brazilian) {
    return prazoFromParts(
      Number(brazilian[3]),
      Number(brazilian[2]),
      Number(brazilian[1]),
      Number(brazilian[4] ?? 0),
      Number(brazilian[5] ?? 0),
      Number(brazilian[6] ?? 0),
    );
  }

  const iso = text.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (iso) {
    return prazoFromParts(
      Number(iso[1]),
      Number(iso[2]),
      Number(iso[3]),
      Number(iso[4]),
      Number(iso[5]),
      Number(iso[6] ?? 0),
    );
  }

  if (/^\d+(\.\d+)?$/.test(text)) return prazoFromExcelSerial(Number(text));
  return null;
}

export function formatPrazo(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return prazoFormatter.format(date);
}

export function formatClock(date: Date): string {
  return clockFormatter.format(date);
}

export function urgencyOf(prazoIso: string, now: number): Urgency {
  const remaining = new Date(prazoIso).getTime() - now;
  if (remaining <= 0) return "vencido";
  if (remaining <= 60 * 60 * 1000) return "critico";
  if (remaining <= 3 * 60 * 60 * 1000) return "alerta";
  if (remaining <= 8 * 60 * 60 * 1000) return "atencao";
  if (remaining <= 24 * 60 * 60 * 1000) return "folga";
  return "ok";
}

export function inAlertWindow(prazoIso: string, now: number): boolean {
  const remaining = new Date(prazoIso).getTime() - now;
  return remaining > 0 && remaining <= ALERT_WINDOW_MS;
}

export function formatRemaining(prazoIso: string, now: number): string {
  const remaining = new Date(prazoIso).getTime() - now;
  const totalMinutes = Math.round(Math.abs(remaining) / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes - days * 24 * 60) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} d`);
  if (hours) parts.push(`${hours} h`);
  if (minutes || parts.length === 0) parts.push(`${minutes} min`);
  const text = parts.join(" ");
  if (remaining < 0) return `vencido há ${text}`;
  if (totalMinutes === 0) return "agora";
  return `faltam ${text}`;
}

export function mapsLink(service: Pick<Service, "lat" | "lng" | "endereco">): string {
  if (
    service.lat != null &&
    service.lng != null &&
    Math.abs(service.lat) <= 90 &&
    Math.abs(service.lng) <= 180
  ) {
    return `https://www.google.com/maps/dir/?api=1&destination=${service.lat},${service.lng}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(service.endereco)}`;
}

export function buildMessage(service: Service, now: number): string {
  const remaining = new Date(service.prazoIso).getTime() - now;
  const minutes = Math.max(1, Math.round(Math.abs(remaining) / 60000));
  const minuteLabel = minutes === 1 ? "1 minuto" : `${minutes} minutos`;
  const intro =
    remaining <= 0
      ? "O prazo de realização deste serviço já encerrou."
      : minutes >= 50
        ? "Falta cerca de uma hora para o fim do prazo de realização do serviço."
        : `Falta menos de uma hora para o fim do prazo de realização do serviço (cerca de ${minuteLabel}).`;

  return [
    intro,
    "",
    `Cliente: ${service.cliente || "não informado"}`,
    `Código TdC: ${service.codigoTdc}`,
    `Responsável: ${service.chefe || "não informado"}`,
    `Endereço: ${service.endereco || "não informado"}`,
    `Prazo ANS legal: ${formatPrazo(service.prazoIso)}`,
    `Localização: ${mapsLink(service)}`,
  ].join("\n");
}

export function matchAgent(chefe: string, phones: PhoneEntry[]): PhoneEntry | null {
  const target = normalizeName(chefe);
  if (!target) return null;
  const agents = phones.filter((entry) => entry.papel === "agente");
  const exact = agents.filter((entry) => normalizeName(entry.nome) === target);
  if (exact.length > 0) return exact[0];

  const targetTokens = target.split(" ").filter((token) => token.length > 1);
  if (targetTokens.length < 2) return null;

  const partial = agents.filter((entry) => {
    const tokens = normalizeName(entry.nome)
      .split(" ")
      .filter((token) => token.length > 1);
    if (tokens.length < 2) return false;
    const smaller = tokens.length <= targetTokens.length ? tokens : targetTokens;
    const larger = tokens.length <= targetTokens.length ? targetTokens : tokens;
    return smaller.every((token) => larger.includes(token));
  });
  return partial.length === 1 ? partial[0] : null;
}

export type Recipient = {
  papel: "agente" | "responsavel";
  nome: string;
  phone: string;
};

export function recipientsFor(
  service: Pick<Service, "chefe">,
  phones: PhoneEntry[],
  extraOwnerPhone: string,
): Recipient[] {
  const recipients: Recipient[] = [];
  const seen = new Set<string>();
  const add = (recipient: Recipient) => {
    if (!recipient.phone || seen.has(recipient.phone)) return;
    seen.add(recipient.phone);
    recipients.push(recipient);
  };

  const agent = matchAgent(service.chefe, phones);
  if (agent) {
    add({ papel: "agente", nome: agent.nome, phone: agent.telefone });
  }
  for (const owner of phones.filter((entry) => entry.papel === "responsavel")) {
    add({ papel: "responsavel", nome: owner.nome, phone: owner.telefone });
  }
  const extra = normalizePhone(extraOwnerPhone);
  if (extra) add({ papel: "responsavel", nome: "Número adicional", phone: extra });
  return recipients;
}

export function parseDelimited(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell.length || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((current) => current.some((value) => value.length > 0));
}

function detectDelimiter(text: string): string {
  const line = text.split(/\r?\n/).find((item) => item.trim()) ?? "";
  let semicolons = 0;
  let commas = 0;
  let tabs = 0;
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && char === ";") semicolons += 1;
    else if (!inQuotes && char === ",") commas += 1;
    else if (!inQuotes && char === "\t") tabs += 1;
  }
  if (tabs >= commas && tabs >= semicolons && tabs > 0) return "\t";
  if (semicolons >= commas && semicolons > 0) return ";";
  return ",";
}

export function parseCoord(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}
