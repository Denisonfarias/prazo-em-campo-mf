import * as XLSX from "xlsx";

import { normalizeHeader, parsePrazo } from "@/lib/domain";

export type FechamentoItem = {
  codigoTdc: string;
  prazoIso: string;
  fimIso: string;
  chefe: string;
  fora: boolean;
};

export type FechamentoParse = {
  fora: number;
  dentro: number;
  semDataFim: number;
  itens: FechamentoItem[];
};

export function isFechamentoWorkbook(filename: string, buffer: Uint8Array): boolean {
  const lower = filename.toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) return false;
  try {
    const names = XLSX.read(buffer, { type: "array", bookSheets: true }).SheetNames;
    return Boolean(sheetName(names, "tdc") && sheetName(names, "linhas tdc"));
  } catch {
    return false;
  }
}

export function parseFechamento(filename: string, buffer: Uint8Array): FechamentoParse {
  const lower = filename.toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
    throw new Error(
      "O arquivo de baixas precisa ser o Excel (.xlsx) com as abas TdC e Linhas TdC.",
    );
  }

  const names = XLSX.read(buffer, { type: "array", bookSheets: true }).SheetNames;
  const tdcName = sheetName(names, "tdc");
  const linhasName = sheetName(names, "linhas tdc");
  if (!tdcName || !linhasName) {
    throw new Error(
      "Não encontrei as abas TdC e Linhas TdC. Anexe o Excel original, com as duas abas.",
    );
  }

  const book = XLSX.read(buffer, {
    type: "array",
    cellDates: false,
    sheets: [tdcName, linhasName],
  });
  const prazos = readPrazos(book.Sheets[tdcName]);
  const fins = readFins(book.Sheets[linhasName]);
  if (!prazos.size) {
    throw new Error("A aba TdC não tem Código TdC com Prazo ANS Legal.");
  }

  let fora = 0;
  let dentro = 0;
  let semDataFim = 0;
  const itens: FechamentoItem[] = [];
  for (const [codigoTdc, prazo] of prazos) {
    const fim = fins.get(codigoTdc);
    if (!fim) {
      semDataFim += 1;
      continue;
    }
    const late = fim.fimIso > prazo.prazoIso;
    if (late) fora += 1;
    else dentro += 1;
    itens.push({
      codigoTdc,
      prazoIso: prazo.prazoIso,
      fimIso: fim.fimIso,
      chefe: prazo.chefe || fim.chefe,
      fora: late,
    });
  }

  itens.sort((a, b) => {
    if (a.fora !== b.fora) return a.fora ? -1 : 1;
    return b.fimIso.localeCompare(a.fimIso);
  });

  return { fora, dentro, semDataFim, itens };
}

function sheetName(names: string[], expected: string): string | null {
  return names.find((name) => normalizeHeader(name) === expected) ?? null;
}

function readPrazos(sheet: XLSX.WorkSheet | undefined): Map<string, { prazoIso: string; chefe: string }> {
  if (!sheet) throw new Error("A aba TdC está vazia.");
  const found = findHeader(sheet, (headers) => {
    return (
      headers.some((header) => header.includes("codigo tdc")) &&
      headers.some((header) => header.includes("prazo ans legal"))
    );
  });
  if (!found) {
    throw new Error("Na aba TdC, não encontrei as colunas Código TdC e Prazo ANS Legal.");
  }
  const codigoCol = found.headers.findIndex((header) => header.includes("codigo tdc"));
  const prazoCol = found.headers.findIndex((header) => header.includes("prazo ans legal"));
  const chefeCol = chefeColumn(found.headers);
  const prazos = new Map<string, { prazoIso: string; chefe: string }>();
  eachDataRow(sheet, found, (row) => {
    const codigo = codeAt(sheet, row, found.startCol + codigoCol);
    const prazoIso = dateAt(sheet, row, found.startCol + prazoCol);
    if (!codigo || !prazoIso || prazos.has(codigo)) return;
    prazos.set(codigo, { prazoIso, chefe: chefeCol < 0 ? "" : textAt(sheet, row, found.startCol + chefeCol) });
  });
  return prazos;
}

function readFins(sheet: XLSX.WorkSheet | undefined): Map<string, { fimIso: string; chefe: string }> {
  if (!sheet) throw new Error("A aba Linhas TdC está vazia.");
  const found = findHeader(sheet, (headers) => {
    const hasCode = headers.some((header) => header === "tdc" || header === "codigo tdc");
    const hasFim = headers.some((header) => header === "data fim" || header.includes("data fim"));
    return hasCode && hasFim;
  });
  if (!found) {
    throw new Error("Na aba Linhas TdC, não encontrei as colunas TdC e Data Fim.");
  }
  let codeCol = found.headers.findIndex((header) => header === "tdc");
  if (codeCol < 0) codeCol = found.headers.findIndex((header) => header === "codigo tdc");
  let fimCol = found.headers.findIndex((header) => header === "data fim");
  if (fimCol < 0) fimCol = found.headers.findIndex((header) => header.includes("data fim"));
  const chefeCol = chefeColumn(found.headers);
  const fins = new Map<string, { fimIso: string; chefe: string }>();
  eachDataRow(sheet, found, (row) => {
    const codigo = codeAt(sheet, row, found.startCol + codeCol);
    const fimIso = dateAt(sheet, row, found.startCol + fimCol);
    if (!codigo || !fimIso) return;
    const current = fins.get(codigo);
    if (!current || fimIso > current.fimIso) {
      fins.set(codigo, {
        fimIso,
        chefe: chefeCol < 0 ? "" : textAt(sheet, row, found.startCol + chefeCol),
      });
    }
  });
  return fins;
}

function chefeColumn(headers: string[]): number {
  return headers.findIndex(
    (header) => header.includes("chefe") || header.includes("responsavel de equipe"),
  );
}

type HeaderHit = { row: number; startCol: number; headers: string[]; endRow: number };

function findHeader(
  sheet: XLSX.WorkSheet,
  matches: (headers: string[]) => boolean,
): HeaderHit | null {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const lastHeaderRow = Math.min(range.e.r, range.s.r + 24);
  for (let row = range.s.r; row <= lastHeaderRow; row += 1) {
    const headers: string[] = [];
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      headers.push(normalizeHeader(textAt(sheet, row, col)));
    }
    if (matches(headers)) {
      return { row, startCol: range.s.c, headers, endRow: range.e.r };
    }
  }
  return null;
}

function eachDataRow(sheet: XLSX.WorkSheet, found: HeaderHit, visit: (row: number) => void) {
  for (let row = found.row + 1; row <= found.endRow; row += 1) visit(row);
}

function codeAt(sheet: XLSX.WorkSheet, row: number, col: number): string {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })] as XLSX.CellObject | undefined;
  if (!cell || cell.v == null || cell.v === "") return "";
  if (typeof cell.v === "number" && Number.isFinite(cell.v)) {
    return Number.isInteger(cell.v) ? String(cell.v) : String(cell.v).trim();
  }
  return String(cell.w ?? cell.v).trim();
}

function dateAt(sheet: XLSX.WorkSheet, row: number, col: number): string | null {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })] as XLSX.CellObject | undefined;
  if (!cell || cell.v == null || cell.v === "") return null;
  if (typeof cell.v === "number" && Number.isFinite(cell.v)) {
    return parsePrazo(String(cell.v)) ?? parsePrazo(String(cell.w ?? ""));
  }
  return parsePrazo(String(cell.w ?? cell.v));
}

function textAt(sheet: XLSX.WorkSheet, row: number, col: number): string {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })] as XLSX.CellObject | undefined;
  if (!cell) return "";
  return String(cell.w ?? cell.v ?? "").trim();
}
