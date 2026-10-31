import assert from "node:assert/strict";
import test from "node:test";

import * as XLSX from "xlsx";

import { dispatchDueAlerts } from "@/lib/alerts";
import {
  buildMessage,
  formatPrazo,
  inAlertWindow,
  mapsLink,
  whatsappLink,
  matchAgent,
  normalizePhone,
  parseDelimited,
  parsePrazo,
  prazoFromExcelSerial,
  prazoFromParts,
  recipientsFor,
  urgencyOf,
} from "@/lib/domain";
import { parsePhoneSheet } from "@/lib/phones";
import { parseUpload } from "@/lib/parse-services";
import { emptyStore } from "@/lib/store";
import type { PhoneEntry, Service } from "@/lib/types";

const PRAZO = prazoFromParts(2026, 10, 31, 16, 0, 0)!;

test("interpreta prazo brasileiro como horário de Brasília", () => {
  assert.equal(parsePrazo("31/10/2026 16:00"), PRAZO);
  assert.equal(formatPrazo(PRAZO), "31/10/2026, 16:00");
  assert.equal(new Date(PRAZO).toISOString(), "2026-10-31T19:00:00.000Z");
});

test("interpreta número de série do Excel como o mesmo horário de parede", () => {
  const serial = Date.UTC(2026, 9, 31, 16, 0, 0) / 86400000 + 25569;
  assert.equal(prazoFromExcelSerial(serial), PRAZO);
});

test("classifica a proximidade do vencimento", () => {
  const deadline = Date.parse(PRAZO);
  assert.equal(urgencyOf(PRAZO, deadline - 30 * 60 * 1000), "critico");
  assert.equal(urgencyOf(PRAZO, deadline - 2 * 60 * 60 * 1000), "alerta");
  assert.equal(urgencyOf(PRAZO, deadline - 5 * 60 * 60 * 1000), "atencao");
  assert.equal(urgencyOf(PRAZO, deadline - 20 * 60 * 60 * 1000), "folga");
  assert.equal(urgencyOf(PRAZO, deadline - 30 * 60 * 60 * 1000), "ok");
  assert.equal(urgencyOf(PRAZO, deadline + 60 * 1000), "vencido");
  assert.equal(inAlertWindow(PRAZO, deadline - 59 * 60 * 1000), true);
  assert.equal(inAlertWindow(PRAZO, deadline - 61 * 60 * 1000), false);
  assert.equal(inAlertWindow(PRAZO, deadline + 1000), false);
});

test("normaliza telefone brasileiro e acha o responsável pelo nome", () => {
  assert.equal(normalizePhone("(85) 99826-3474"), "5585998263474");
  assert.equal(normalizePhone("5585988460432"), "5585988460432");
  assert.equal(normalizePhone("123"), null);

  const phones: PhoneEntry[] = [
    {
      nome: "Ana Kelly",
      telefone: "5585998263474",
      telefoneOriginal: "85998263474",
      info: "meu numero",
      papel: "responsavel",
    },
    {
      nome: "Jorge José Henrique",
      telefone: "5585999990000",
      telefoneOriginal: "85999990000",
      info: "agente de campo",
      papel: "agente",
    },
  ];
  assert.equal(matchAgent("JORGE JOSE HENRIQUE", phones)?.telefone, "5585999990000");
  assert.equal(matchAgent("Ana Kelly", phones), null);
  assert.equal(matchAgent("Denison", phones), null);

  const recipients = recipientsFor(
    { chefe: "JORGE JOSÉ HENRIQUE" },
    phones,
    "85 98888-7777",
  );
  assert.deepEqual(
    recipients.map((item) => item.phone),
    ["5585999990000", "5585998263474", "5585988887777"],
  );
});

test("lê a planilha de telefones e separa o seu número", () => {
  const entries = parsePhoneSheet(
    "Nome,Telefone,mais_informacoes\nAna Kelly,85998263474,meu número\nDenison,85988460432,agente de campo\n",
  );
  assert.equal(entries[0]?.papel, "responsavel");
  assert.equal(entries[1]?.papel, "agente");
  assert.equal(entries[1]?.telefone, "5585988460432");
});

test("lê csv de serviços separado por ponto e vírgula", () => {
  const csv = [
    "Código TdC;Chefe/Responsável de Equipe;Endereço Completo;Prazo ANS Legal;Nome e Sobrenome Cliente;Latitude;Longitude;Município",
    "47468120;JORGE JOSÉ HENRIQUE;ST RIACHO SECO 00000 - S, MISSAO VELHA - CE;31/10/2026 16:00;MARIA DA SILVA;-7.23;-39.31;MISSAO VELHA",
  ].join("\n");
  const services = parseUpload("servicos.csv", Buffer.from(csv));
  assert.equal(services.length, 1);
  assert.equal(services[0]?.codigoTdc, "47468120");
  assert.equal(services[0]?.prazoIso, PRAZO);
  assert.equal(services[0]?.lat, -7.23);
  assert.equal(services[0]?.lng, -39.31);
  assert.match(mapsLink(services[0]!), /destination=-7\.23,-39\.31/);
  const message = buildMessage(services[0]!, Date.parse(PRAZO) - 55 * 60 * 1000);
  assert.match(message, /cerca de uma hora/);
  assert.match(message, /MARIA DA SILVA/);
  assert.match(message, /ST RIACHO SECO/);
  assert.match(message, /google\.com\/maps/);
  const link = whatsappLink("5585999990000", message);
  assert.ok(link.startsWith("https://wa.me/5585999990000?text="));
  assert.match(decodeURIComponent(link), /MARIA DA SILVA/);
  assert.match(decodeURIComponent(link), /ST RIACHO SECO/);
});

test("lê xlsx com as mesmas colunas", () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Código TdC", "Chefe/Responsável de Equipe", "Endereço Completo", "Prazo ANS Legal", "Nome e Sobrenome Cliente"],
    ["1", "Equipe Sul", "Rua A 10", "31/10/2026 16:00", "Cliente Um"],
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Servicos");
  const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const services = parseUpload("servicos.xlsx", buffer);
  assert.equal(services[0]?.cliente, "Cliente Um");
  assert.equal(services[0]?.prazoIso, PRAZO);
});

test("prepara o aviso uma vez na última hora e não dispara fora dela", async () => {
  const service: Service = {
    id: "1",
    codigoTdc: "47468120",
    chefe: "Denison",
    endereco: "Rua A 10",
    cliente: "Cliente Um",
    prazoIso: PRAZO,
    lat: -7.2,
    lng: -39.3,
    municipio: "MISSAO VELHA",
    estadoTdc: "Enviado ao Campo",
    equipe: "Denison",
  };
  const store = emptyStore();
  store.services = [service];
  store.phones = [
    {
      nome: "Ana Kelly",
      telefone: "5585998263474",
      telefoneOriginal: "85998263474",
      info: "meu numero",
      papel: "responsavel",
    },
    {
      nome: "Denison",
      telefone: "5585988460432",
      telefoneOriginal: "85988460432",
      info: "agente de campo",
      papel: "agente",
    },
  ];

  const tooEarly = await dispatchDueAlerts(store, Date.parse(PRAZO) - 2 * 60 * 60 * 1000);
  assert.equal(tooEarly.prepared, 0);
  assert.equal(store.alerts.length, 0);

  const due = await dispatchDueAlerts(store, Date.parse(PRAZO) - 40 * 60 * 1000);
  assert.equal(due.prepared, 0);
  assert.equal(store.alerts.length, 0);
  assert.match(buildMessage(service, Date.parse(PRAZO) - 40 * 60 * 1000), /cerca de 40 minutos/);
  assert.match(buildMessage(service, Date.parse(PRAZO) + 5 * 60 * 1000), /já encerrou/);

  const late = await dispatchDueAlerts(store, Date.parse(PRAZO) + 5 * 60 * 1000);
  assert.equal(late.prepared, 0);
});

test("detecta vírgula e ponto e vírgula no csv", () => {
  const rows = parseDelimited('a;b\n"1;2";3\n');
  assert.deepEqual(rows, [
    ["a", "b"],
    ["1;2", "3"],
  ]);
});
