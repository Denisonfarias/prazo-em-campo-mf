import assert from "node:assert/strict";
import test from "node:test";

import * as XLSX from "xlsx";

import { parseFechamento } from "@/lib/parse-fechamento";

function bookOf(tdc: XLSX.WorkSheet, linhas: XLSX.WorkSheet): Uint8Array {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, tdc, "TdC");
  XLSX.utils.book_append_sheet(book, linhas, "Linhas TdC");
  return new Uint8Array(XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer);
}

function workbook(): Uint8Array {
  const tdc = XLSX.utils.aoa_to_sheet([
    ["Código TdC", "Prazo ANS Legal", "Chefe/Responsável de Equipe", "Nome e Sobrenome Cliente"],
    ["100", "02/10/2026 12:00", "Chefe Ana", "Ana"],
    ["200", "02/10/2026 18:00", "Chefe Bruno", "Bruno"],
    ["300", "03/10/2026 10:00", "Chefe Carla", "Carla"],
    ["400", "04/10/2026 09:00", "Chefe Davi", "Davi"],
  ]);
  const linhas = XLSX.utils.aoa_to_sheet([
    ["Chefe/Responsável de Equipe", "TdC", "Data Inicio", "Data Fim"],
    ["Equipe A", "100", "02/10/2026 10:00", "02/10/2026 11:00"],
    ["Equipe Z", "100", "02/10/2026 11:30", "02/10/2026 13:00"],
    ["Equipe B", "200", "02/10/2026 16:00", "02/10/2026 18:00"],
    ["Equipe C", "300", "03/10/2026 08:00", ""],
    ["Equipe D", "999", "04/10/2026 08:00", "04/10/2026 12:00"],
  ]);
  return bookOf(tdc, linhas);
}

test("cruza Data Fim com Prazo ANS Legal e usa a baixa mais recente", () => {
  const result = parseFechamento("baixas.xlsx", workbook());
  assert.equal(result.fora, 1);
  assert.equal(result.dentro, 1);
  assert.equal(result.semDataFim, 2);
  const late = result.itens.find((item) => item.codigoTdc === "100");
  const onTime = result.itens.find((item) => item.codigoTdc === "200");
  assert.equal(late?.fora, true);
  assert.equal(late?.chefe, "Chefe Ana");
  assert.equal(onTime?.fora, false);
  assert.equal(onTime?.chefe, "Chefe Bruno");
  assert.equal(
    result.itens.some((item) => item.codigoTdc === "300" || item.codigoTdc === "999"),
    false,
  );
});

test("lê Chefe/Responsável de Equipe na aba TdC, mesmo com título acima", () => {
  const tdc = XLSX.utils.aoa_to_sheet([
    ["Relatório de baixas"],
    ["Código TdC", "Prazo ANS Legal"],
    [
      "Código TdC",
      "Processo",
      "Tipo TdC - Op",
      "Código Equipe",
      "Equipe",
      "Chefe/Responsável\nde Equipe",
      "Prazo ANS Legal",
    ],
    [
      "47463091",
      "Gestão Inadimplências",
      "Religação",
      "008083",
      "OUTRA EQUIPE",
      "FERREIRA DOS SANTOS OCLECIANO",
      "29/10/2026 10:09",
    ],
    ["47428564", "Gestão", "Religação", "001", "EQUIPE B", "EDNO DE SOUZA JOSÉ", "27/10/2026 15:57"],
  ]);
  const linhas = XLSX.utils.aoa_to_sheet([
    ["TdC", "Data Inicio", "Data Fim"],
    ["47463091", "29/10/2026 09:00", "29/10/2026 11:26"],
    ["47428564", "27/10/2026 14:00", "27/10/2026 16:52"],
  ]);
  const result = parseFechamento("baixas.xlsx", bookOf(tdc, linhas));
  assert.equal(
    result.itens.find((item) => item.codigoTdc === "47463091")?.chefe,
    "FERREIRA DOS SANTOS OCLECIANO",
  );
  assert.equal(result.itens.find((item) => item.codigoTdc === "47428564")?.chefe, "EDNO DE SOUZA JOSÉ");
});

test("usa a coluna Equipe quando a aba não traz o chefe", () => {
  const tdc = XLSX.utils.aoa_to_sheet([
    ["Código TdC", "Equipe", "Prazo ANS Legal"],
    ["100", "DA COSTA DANTAS WESLEY", "02/10/2026 12:00"],
  ]);
  const linhas = XLSX.utils.aoa_to_sheet([
    ["TdC", "Data Fim"],
    ["100", "02/10/2026 13:00"],
  ]);
  const result = parseFechamento("baixas.xlsx", bookOf(tdc, linhas));
  assert.equal(result.itens[0]?.chefe, "DA COSTA DANTAS WESLEY");
});

test("recusa arquivo sem as duas abas", () => {
  const sheet = XLSX.utils.aoa_to_sheet([["Código TdC", "Prazo ANS Legal"], ["1", "02/10/2026 12:00"]]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "TdC");
  const buffer = new Uint8Array(XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer);
  assert.throws(() => parseFechamento("so-tdc.xlsx", buffer), /Linhas TdC/);
});
