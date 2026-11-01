import assert from "node:assert/strict";
import test from "node:test";

import type { Service } from "@/lib/types";
import { isOpenWork, markFeito, mergeUpload, undoFeito } from "@/lib/workflow";

function service(codigoTdc: string, extra: Partial<Service> = {}): Service {
  return {
    id: codigoTdc,
    codigoTdc,
    chefe: "Denison",
    endereco: "Rua A",
    cliente: "Cliente",
    prazoIso: "2026-10-31T19:00:00.000Z",
    lat: null,
    lng: null,
    municipio: "CRATO",
    estadoTdc: "Enviado ao Campo",
    equipe: "Denison",
    ...extra,
  };
}

test("marcar feito tira o serviço da fila e o arquivo seguinte conclui", () => {
  const first = mergeUpload([], [service("1"), service("2")], "2026-10-31T12:00:00.000Z");
  const marked = markFeito(first.services, "1", "2026-10-31T13:00:00.000Z");
  assert.equal(marked.filter(isOpenWork).map((item) => item.codigoTdc).join(), "2");
  assert.equal(marked.find((item) => item.codigoTdc === "1")?.status, "feito");

  const second = mergeUpload(marked, [service("2", { endereco: "Rua B" })], "2026-10-31T18:00:00.000Z");
  assert.equal(second.promovidos, 1);
  assert.equal(second.services.find((item) => item.codigoTdc === "1")?.status, "concluido");
  assert.equal(second.services.find((item) => item.codigoTdc === "2")?.endereco, "Rua B");
  assert.equal(second.services.find((item) => item.codigoTdc === "2")?.status, "aberto");
  assert.equal(isOpenWork(second.services.find((item) => item.codigoTdc === "1")!), false);
});

test("feito que ainda está no arquivo novo continua feito", () => {
  const marked = markFeito([service("1")], "1", "2026-10-31T13:00:00.000Z");
  const next = mergeUpload(marked, [service("1", { cliente: "Novo nome" })], "2026-10-31T18:00:00.000Z");
  const kept = next.services.find((item) => item.codigoTdc === "1");
  assert.equal(kept?.status, "feito");
  assert.equal(kept?.cliente, "Novo nome");
  assert.equal(next.promovidos, 0);
});

test("serviço em aberto que sai do arquivo não vira concluído", () => {
  const first = mergeUpload([], [service("1"), service("2")], "2026-10-31T12:00:00.000Z");
  const second = mergeUpload(first.services, [service("2")], "2026-10-31T18:00:00.000Z");
  assert.equal(second.removidos, 1);
  assert.equal(second.promovidos, 0);
  assert.equal(
    second.services.some((item) => item.codigoTdc === "1"),
    false,
  );
});

test("desfazer feito devolve o serviço para a fila", () => {
  const marked = markFeito([service("1", { noArquivoAtual: true })], "1", "2026-10-31T13:00:00.000Z");
  const undone = undoFeito(marked, "1");
  assert.equal(isOpenWork(undone[0]!), true);
});
