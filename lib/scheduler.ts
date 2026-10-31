import { runAlertCheck } from "@/lib/alerts";

const globalScope = globalThis as typeof globalThis & {
  __prazoTimer?: ReturnType<typeof setInterval>;
  __prazoBoot?: ReturnType<typeof setTimeout>;
};

export function startScheduler() {
  if (globalScope.__prazoTimer) return;

  const tick = () => {
    void runAlertCheck().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[prazos] varredura: ${message}`);
    });
  };

  globalScope.__prazoBoot = setTimeout(tick, 2500);
  globalScope.__prazoTimer = setInterval(tick, 30_000);
}
