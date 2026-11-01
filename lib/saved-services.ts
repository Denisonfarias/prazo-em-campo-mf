import type { Service } from "@/lib/types";

const STORAGE_KEY = "prazo-em-campo-v1";

export type SavedServices = {
  fileName: string | null;
  uploadedAt: string | null;
  services: Service[];
};

export function emptySavedServices(): SavedServices {
  return { fileName: null, uploadedAt: null, services: [] };
}

export function loadSavedServices(): SavedServices {
  if (typeof window === "undefined") return emptySavedServices();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptySavedServices();
    const parsed = JSON.parse(raw) as Partial<SavedServices>;
    return {
      fileName: parsed.fileName ?? null,
      uploadedAt: parsed.uploadedAt ?? null,
      services: Array.isArray(parsed.services) ? parsed.services : [],
    };
  } catch {
    return emptySavedServices();
  }
}

export function saveSavedServices(saved: SavedServices) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}
