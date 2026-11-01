import * as XLSX from "xlsx";

import { normalizeHeader, parseCoord, parseDelimited, parsePrazo } from "@/lib/domain";
import type { Service } from "@/lib/types";

export function parseUpload(filename: string, buffer: Uint8Array): Service[] {
  const rows = looksLikeXlsx(filename, buffer)
    ? workbookRows(buffer)
    : parseDelimited(new TextDecoder("utf-8").decode(buffer));
  return rowsToServices(rows);
}

function looksLikeXlsx(filename: string, buffer: Uint8Array): boolean {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return true;
  if (lower.endsWith(".csv")) return false;
  return buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function workbookRows(buffer: Uint8Array): string[][] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  if (!workbook.SheetNames.length) {
    throw new Error("A planilha não tem abas.");
  }
  const named = workbook.SheetNames.find((name) => {
    const rows = sheetToRows(workbook.Sheets[name]);
    return findHeaderIndex(rows) >= 0;
  });
  const sheetName = named ?? workbook.SheetNames[0];
  return sheetToRows(workbook.Sheets[sheetName]);
}

function sheetToRows(sheet: XLSX.WorkSheet): string[][] {
  const rows = XLSX.utils.sheet_to_json<Array<string | number>>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  return rows.map((row) =>
    (Array.isArray(row) ? row : []).map((cell) => String(cell ?? "").trim()),
  );
}

function findHeaderIndex(rows: string[][]): number {
  const limit = Math.min(rows.length, 25);
  for (let index = 0; index < limit; index += 1) {
    const joined = rows[index].map(normalizeHeader).join(" | ");
    if (joined.includes("prazo ans legal") && joined.includes("codigo tdc")) {
      return index;
    }
  }
  return -1;
}

function rowsToServices(rows: string[][]): Service[] {
  const headerIndex = findHeaderIndex(rows);
  if (headerIndex < 0) {
    throw new Error(
      "Não encontrei as colunas Código TdC e Prazo ANS Legal. Exporte a planilha de serviços com o cabeçalho original.",
    );
  }
  const headers = rows[headerIndex].map(normalizeHeader);
  const column = (predicate: (header: string) => boolean) =>
    headers.findIndex(predicate);

  const codigo = column((header) => header.includes("codigo tdc"));
  const chefe = column(
    (header) => header.includes("chefe") || header.includes("responsavel de equipe"),
  );
  const endereco = column((header) => header.includes("endereco completo"));
  const prazo = column((header) => header.includes("prazo ans legal"));
  const cliente = column(
    (header) =>
      header.includes("nome e sobrenome") ||
      header.includes("nome cliente") ||
      header === "cliente",
  );
  const latitude = column((header) => header === "latitude");
  const longitude = column((header) => header === "longitude");
  const municipio = column((header) => header === "municipio");
  const estado = column((header) => header === "estado tdc");
  const equipe = column((header) => header === "equipe");

  const missing: string[] = [];
  if (codigo < 0) missing.push("Código TdC");
  if (chefe < 0) missing.push("Chefe/Responsável de Equipe");
  if (endereco < 0) missing.push("Endereço Completo");
  if (prazo < 0) missing.push("Prazo ANS Legal");
  if (cliente < 0) missing.push("Nome e Sobrenome Cliente");
  if (missing.length) {
    throw new Error(`Faltam colunas obrigatórias: ${missing.join(", ")}.`);
  }

  const services: Service[] = [];
  let ignored = 0;
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    const codigoTdc = cell(row, codigo);
    const prazoIso = parsePrazo(cell(row, prazo));
    if (!codigoTdc || !prazoIso) {
      if (row.some((value) => value.trim())) ignored += 1;
      continue;
    }
    const lat = latitude >= 0 ? parseCoord(cell(row, latitude)) : null;
    const lng = longitude >= 0 ? parseCoord(cell(row, longitude)) : null;
    services.push({
      id: `${codigoTdc}-${index}`,
      codigoTdc,
      chefe: cell(row, chefe),
      endereco: cell(row, endereco),
      cliente: cell(row, cliente),
      prazoIso,
      lat: lat != null && Math.abs(lat) <= 90 ? lat : null,
      lng: lng != null && Math.abs(lng) <= 180 ? lng : null,
      municipio: cell(row, municipio),
      estadoTdc: cell(row, estado),
      equipe: cell(row, equipe),
    });
  }

  if (!services.length) {
    throw new Error(
      ignored
        ? "Nenhuma linha tinha Código TdC e Prazo ANS Legal válidos."
        : "A planilha não tem serviços.",
    );
  }
  return services;
}

function cell(row: string[], index: number): string {
  if (index < 0) return "";
  return (row[index] ?? "").trim();
}
