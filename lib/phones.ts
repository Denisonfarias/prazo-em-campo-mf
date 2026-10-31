import { SHEET_CSV_URL } from "@/lib/config";
import { normalizeHeader, normalizeName, normalizePhone, parseDelimited } from "@/lib/domain";
import type { PhoneEntry } from "@/lib/types";

export function parsePhoneSheet(csv: string): PhoneEntry[] {
  const rows = parseDelimited(csv);
  if (!rows.length) return [];
  const headers = rows[0].map(normalizeHeader);
  const nameIndex = headers.findIndex((header) => header === "nome" || header.startsWith("nome "));
  const phoneIndex = headers.findIndex((header) =>
    /telefone|celular|whatsapp|fone/.test(header),
  );
  const infoIndex = headers.findIndex((header) =>
    /inform|observa|papel|tipo/.test(header),
  );
  if (nameIndex < 0 || phoneIndex < 0) {
    throw new Error("A planilha de telefones precisa das colunas Nome e Telefone.");
  }

  const entries: PhoneEntry[] = [];
  for (const row of rows.slice(1)) {
    const nome = (row[nameIndex] ?? "").trim();
    const telefoneOriginal = (row[phoneIndex] ?? "").trim();
    const info = infoIndex >= 0 ? (row[infoIndex] ?? "").trim() : "";
    if (!nome && !telefoneOriginal) continue;
    const telefone = normalizePhone(telefoneOriginal);
    if (!nome || !telefone) continue;
    const papel = normalizeName(info).includes("meu numero") ? "responsavel" : "agente";
    entries.push({ nome, telefone, telefoneOriginal, info, papel });
  }
  return entries;
}

export async function fetchPhoneSheet(): Promise<PhoneEntry[]> {
  const response = await fetch(SHEET_CSV_URL, {
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    throw new Error(`A planilha de telefones respondeu ${response.status}.`);
  }
  const text = await response.text();
  if (text.trim().startsWith("<")) {
    throw new Error(
      "A planilha de telefones não está pública. No Google Planilhas, compartilhe como qualquer pessoa com o link pode ver.",
    );
  }
  return parsePhoneSheet(text);
}
