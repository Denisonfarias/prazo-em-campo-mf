import fs from "fs";
import path from "path";

import type { StoreData, WhatsAppConfig } from "@/lib/types";

const dataDir = path.join(process.cwd(), "data");
const storePath = path.join(dataDir, "store.json");

export function emptyWhatsapp(): WhatsAppConfig {
  return {
    provider: "none",
    metaToken: "",
    metaPhoneNumberId: "",
    webhookUrl: "",
    webhookToken: "",
  };
}

export function emptyStore(): StoreData {
  return {
    fileName: null,
    uploadedAt: null,
    services: [],
    alerts: [],
    extraOwnerPhone: "",
    whatsapp: emptyWhatsapp(),
    phones: [],
    phonesFetchedAt: null,
    phonesError: null,
    lastCheckAt: null,
    lastCheckError: null,
  };
}

function readStore(): StoreData {
  try {
    const raw = fs.readFileSync(storePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    return {
      ...emptyStore(),
      ...parsed,
      services: parsed.services ?? [],
      alerts: parsed.alerts ?? [],
      phones: parsed.phones ?? [],
      whatsapp: { ...emptyWhatsapp(), ...(parsed.whatsapp ?? {}) },
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: StoreData) {
  fs.mkdirSync(dataDir, { recursive: true });
  const temporary = `${storePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(store, null, 2));
  fs.renameSync(temporary, storePath);
}

let chain: Promise<unknown> = Promise.resolve();

export function locked<T>(fn: (store: StoreData) => Promise<T> | T): Promise<T> {
  const run = chain.then(async () => {
    const store = readStore();
    const result = await fn(store);
    writeStore(store);
    return result;
  });
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function readSnapshot(): StoreData {
  return readStore();
}
