"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import * as XLSX from "xlsx";
import {
  Check,
  Download,
  ExternalLink,
  MapPin,
  MessageCircle,
  RefreshCw,
  Undo2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { SettingsDialog, type SettingsView } from "@/components/settings-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildMessage,
  formatClock,
  whatsappLink,
  formatPhone,
  formatPrazo,
  formatRemaining,
  mapsLink,
  matchAgent,
  urgencyOf,
} from "@/lib/domain";
import { SHEET_EDIT_URL } from "@/lib/config";
import { loadFechamento, saveFechamento, type SavedFechamento } from "@/lib/fechamento-store";
import { parseFechamento } from "@/lib/parse-fechamento";
import { parseUpload } from "@/lib/parse-services";
import { loadSavedServices, saveSavedServices } from "@/lib/saved-services";
import type { Alert, PhoneEntry, Service, ServiceStatus, Urgency } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isOpenWork, markFeito, mergeUpload, serviceStatus, undoFeito } from "@/lib/workflow";

type StatePayload = {
  now: string;
  fileName: string | null;
  uploadedAt: string | null;
  services: Service[];
  alerts: Alert[];
  phones: PhoneEntry[];
  phonesFetchedAt: string | null;
  phonesError: string | null;
  lastCheckAt: string | null;
  lastCheckError: string | null;
  sheetUrl: string;
  settings: SettingsView;
};

type Filter =
  | "todos"
  | "aberto"
  | "umaHora"
  | "duasHoras"
  | "tresHoras"
  | "vencido"
  | "feito"
  | "foraPrazo"
  | "semTelefone";

const REPORTS: { value: Filter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "aberto", label: "Em aberto" },
  { value: "umaHora", label: "Faltando 1 hora" },
  { value: "duasHoras", label: "Faltando 2 horas" },
  { value: "tresHoras", label: "Faltando 3 horas" },
  { value: "vencido", label: "Vencido" },
  { value: "feito", label: "Feito" },
  { value: "foraPrazo", label: "Fora do prazo" },
  { value: "semTelefone", label: "Sem telefone" },
];

const URGENCY: Record<
  Urgency,
  { label: string; row: string; chip: string; dot: string }
> = {
  vencido: {
    label: "Vencido",
    row: "bg-neutral-100 hover:bg-neutral-200",
    chip: "bg-black text-white",
    dot: "bg-black",
  },
  critico: {
    label: "Faltando 1 hora",
    row: "bg-red-50 hover:bg-red-100",
    chip: "bg-red-600 text-white",
    dot: "bg-red-600",
  },
  duasHoras: {
    label: "Faltando 2 horas",
    row: "bg-orange-50 hover:bg-orange-100",
    chip: "bg-orange-500 text-white",
    dot: "bg-orange-500",
  },
  tresHoras: {
    label: "Faltando 3 horas",
    row: "bg-yellow-50 hover:bg-yellow-100",
    chip: "bg-yellow-400 text-yellow-950",
    dot: "bg-yellow-400",
  },
  atencao: {
    label: "Até 8 horas",
    row: "bg-amber-50 hover:bg-amber-100",
    chip: "bg-amber-400 text-amber-950",
    dot: "bg-amber-400",
  },
  folga: {
    label: "Até 24 horas",
    row: "bg-lime-50 hover:bg-lime-100",
    chip: "bg-lime-700 text-white",
    dot: "bg-lime-600",
  },
  ok: {
    label: "Mais de 24 horas",
    row: "bg-emerald-50/80 hover:bg-emerald-100",
    chip: "bg-emerald-700 text-white",
    dot: "bg-emerald-600",
  },
};

let clockNow = typeof window === "undefined" ? 0 : Date.now();

function useNow() {
  return useSyncExternalStore(
    (callback) => {
      const id = setInterval(() => {
        clockNow = Date.now();
        callback();
      }, 1000);
      return () => clearInterval(id);
    },
    () => clockNow,
    () => 0,
  );
}

const ALERT_LABEL: Record<Alert["status"], string> = {
  enviado: "Avisado",
  parcial: "Aviso parcial",
  falhou: "Falha no envio",
  sem_whatsapp: "Na fila, sem WhatsApp",
  sem_destinatario: "Sem telefone",
};

export function Dashboard() {
  const [data, setData] = useState<StatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingFechamento, setUploadingFechamento] = useState(false);
  const [fechamento, setFechamento] = useState<SavedFechamento | null>(null);
  const [foraPage, setForaPage] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preview, setPreview] = useState<Service | null>(null);
  const [settingsSession, setSettingsSession] = useState(0);
  const now = useNow();
  const fileRef = useRef<HTMLInputElement>(null);
  const baixasRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/phones", { cache: "no-store" });
    const payload = (await response.json()) as {
      phones?: PhoneEntry[];
      phonesFetchedAt?: string | null;
      phonesError?: string | null;
      error?: string;
    };
    if (!response.ok && !payload.phones) {
      throw new Error(payload.error || payload.phonesError || "Não foi possível carregar os telefones.");
    }
    const saved = loadSavedServices();
    setFechamento(await loadFechamento());
    setData({
      now: new Date().toISOString(),
      fileName: saved.fileName,
      uploadedAt: saved.uploadedAt,
      services: saved.services,
      alerts: [],
      phones: payload.phones ?? [],
      phonesFetchedAt: payload.phonesFetchedAt ?? null,
      phonesError: payload.phonesError ?? null,
      lastCheckAt: new Date().toISOString(),
      lastCheckError: null,
      sheetUrl: SHEET_EDIT_URL,
      settings: {
        extraOwnerPhone: "",
        provider: "none",
        metaPhoneNumberId: "",
        webhookUrl: "",
        hasMetaToken: false,
        hasWebhookToken: false,
        activeProvider: "none",
        activeSource: "nenhuma",
      },
    });
    setLoadError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Falha ao carregar.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const poll = setInterval(() => {
      void load().catch((error) => {
        setLoadError(error instanceof Error ? error.message : "Falha ao atualizar.");
      });
    }, 120_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [load]);

  function persistServices(services: Service[], fileName: string | null, uploadedAt: string | null) {
    saveSavedServices({ fileName, uploadedAt, services });
    setData((current) => (current ? { ...current, fileName, uploadedAt, services } : current));
  }

  async function upload(file: File) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    setUploading(true);
    try {
      const incoming = parseUpload(file.name, buffer);
      const previous = loadSavedServices();
      const uploadedAt = new Date().toISOString();
      const merged = mergeUpload(previous.services, incoming, uploadedAt);
      persistServices(merged.services, file.name, uploadedAt);
      const parts = [`${incoming.length} serviços no arquivo.`];
      if (merged.removidos) {
        parts.push(
          merged.removidos === 1
            ? "1 em aberto saiu porque não está mais no arquivo."
            : `${merged.removidos} em aberto saíram porque não estão mais no arquivo.`,
        );
      }
      toast.success(parts.join(" "));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler o arquivo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function applyFechamento(fileName: string, buffer: Uint8Array) {
    setUploadingFechamento(true);
    toast.message("Lendo as abas TdC e Linhas TdC. Em um arquivo grande, isso pode levar um minuto.");
    await new Promise((resolve) => setTimeout(resolve, 40));
    try {
      const parsed = parseFechamento(fileName, buffer);
      const saved: SavedFechamento = {
        ...parsed,
        fileName,
        uploadedAt: new Date().toISOString(),
      };
      await saveFechamento(saved);
      setFechamento(saved);
      setForaPage(0);
      setFilter("foraPrazo");
      toast.success(
        `${parsed.fora} baixados fora do prazo. ${parsed.dentro} dentro do prazo.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler o arquivo de baixas.");
    } finally {
      setUploadingFechamento(false);
      if (baixasRef.current) baixasRef.current.value = "";
    }
  }

  async function uploadFechamento(file: File) {
    await applyFechamento(file.name, new Uint8Array(await file.arrayBuffer()));
  }

  function markServiceFeito(codigoTdc: string) {
    if (!data) return;
    persistServices(markFeito(data.services, codigoTdc, new Date().toISOString()), data.fileName, data.uploadedAt);
    toast.success(`TdC ${codigoTdc} marcado como feito. Saiu da contagem em aberto.`);
  }

  function undoServiceFeito(codigoTdc: string) {
    if (!data) return;
    persistServices(undoFeito(data.services, codigoTdc), data.fileName, data.uploadedAt);
    toast.success(`TdC ${codigoTdc} voltou para em aberto.`);
  }

  const services = useMemo(() => data?.services ?? [], [data?.services]);
  const phones = useMemo(() => data?.phones ?? [], [data?.phones]);
  const chefeByCodigo = useMemo(() => {
    const map = new Map<string, string>();
    for (const service of services) {
      if (service.chefe) map.set(service.codigoTdc, service.chefe);
    }
    return map;
  }, [services]);
  const fechamentoComChefe = useMemo(() => {
    if (!fechamento) return null;
    return {
      ...fechamento,
      itens: fechamento.itens.map((item) => ({
        ...item,
        chefe: item.chefe || chefeByCodigo.get(item.codigoTdc) || "",
      })),
    };
  }, [chefeByCodigo, fechamento]);
  const owners = phones.filter((phone) => phone.papel === "responsavel");
  const agents = phones.filter((phone) => phone.papel === "agente");

  const rows = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    return services
      .map((service) => {
        const urgency = urgencyOf(service.prazoIso, now);
        const agent = matchAgent(service.chefe, phones);
        const alert = data?.alerts.find(
          (item) => item.key === `${service.codigoTdc}|${service.prazoIso}`,
        );
        return { service, urgency, agent, alert };
      })
      .filter(({ service, urgency, agent }) => {
        const status = serviceStatus(service);
        const open = isOpenWork(service);
        if (filter === "aberto" && !open) return false;
        if (filter === "feito" && status !== "feito") return false;
        if (filter === "vencido" && (!open || urgency !== "vencido")) return false;
        if (filter === "umaHora" && (!open || urgency !== "critico")) return false;
        if (filter === "duasHoras" && (!open || urgency !== "duasHoras")) return false;
        if (filter === "tresHoras" && (!open || urgency !== "tresHoras")) return false;
        if (filter === "semTelefone" && (!open || agent)) return false;
        if (!term) return true;
        const haystack = [
          service.codigoTdc,
          service.cliente,
          service.chefe,
          service.endereco,
          service.municipio,
          service.equipe,
          service.estadoTdc,
        ]
          .join(" ")
          .toLocaleLowerCase("pt-BR");
        return haystack.includes(term);
      })
      .sort((a, b) => compareServices(a.service, b.service));
  }, [data?.alerts, filter, now, phones, query, services]);

  const foraItens = useMemo(() => {
    const itens = fechamentoComChefe?.itens.filter((item) => item.fora) ?? [];
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return itens;
    return itens.filter((item) =>
      `${item.codigoTdc} ${item.chefe ?? ""}`.toLocaleLowerCase("pt-BR").includes(term),
    );
  }, [fechamentoComChefe, query]);
  const foraSemResponsavel = foraItens.length > 0 && foraItens.every((item) => !item.chefe);
  const reportLabel = REPORTS.find((report) => report.value === filter)?.label ?? "Relatório";
  const foraPages = Math.max(1, Math.ceil(foraItens.length / 40));
  const foraPageSafe = Math.min(foraPage, foraPages - 1);
  const foraVisible = foraItens.slice(foraPageSafe * 40, foraPageSafe * 40 + 40);

  const counts = useMemo(() => {
    const tally = {
      aberto: 0,
      umaHora: 0,
      duasHoras: 0,
      tresHoras: 0,
      vencido: 0,
      feito: 0,
      semTelefone: 0,
    };
    const missing = new Set<string>();
    for (const service of services) {
      const status = serviceStatus(service);
      if (status === "feito") {
        tally.feito += 1;
        continue;
      }
      if (!isOpenWork(service)) continue;
      tally.aberto += 1;
      const urgency = urgencyOf(service.prazoIso, now);
      if (urgency === "vencido") tally.vencido += 1;
      if (urgency === "critico") tally.umaHora += 1;
      if (urgency === "duasHoras") tally.duasHoras += 1;
      if (urgency === "tresHoras") tally.tresHoras += 1;
      if (!matchAgent(service.chefe, phones) && service.chefe) {
        tally.semTelefone += 1;
        missing.add(service.chefe);
      }
    }
    return { ...tally, chiefs: [...missing].sort((a, b) => a.localeCompare(b, "pt-BR")) };
  }, [now, phones, services]);

  const whatsappReady =
    data?.settings.activeProvider === "meta" || data?.settings.activeProvider === "webhook";

  function previewMessage(service: Service) {
    return (
      data?.alerts.find((alert) => alert.key === `${service.codigoTdc}|${service.prazoIso}`)
        ?.message || (now ? buildMessage(service, now) : "")
    );
  }

  return (
    <div
      className="min-h-full"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) void upload(file);
      }}
    >
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] uppercase opacity-80">
              Acompanhamento de campo
            </p>
            <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              Prazo em Campo
            </h1>
            <p className="mt-1 max-w-xl text-sm text-primary-foreground/85">
              A lista mostra cada serviço do arquivo. A cor vale só para o que ainda está em
              aberto. Quando o responsável confirmar, marque como feito: ele sai dessa contagem.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <p className="font-heading text-lg tabular-nums">
              {now ? formatClock(new Date(now)) : "—"}
              <span className="ml-2 text-xs font-sans tracking-normal opacity-80">
                horário de Brasília
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              <label
                htmlFor="planilha"
                className={cn(
                  buttonVariants({ variant: "secondary" }),
                  uploading && "pointer-events-none opacity-50",
                )}
              >
                <Upload data-icon="inline-start" />
                {uploading ? "Lendo arquivo..." : "Anexar serviços"}
              </label>
              <label
                htmlFor="baixas"
                className={cn(
                  buttonVariants({ variant: "secondary" }),
                  uploadingFechamento && "pointer-events-none opacity-50",
                )}
              >
                <Upload data-icon="inline-start" />
                {uploadingFechamento ? "Lendo baixas..." : "Anexar baixas"}
              </label>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setSettingsSession((value) => value + 1);
                  setSettingsOpen(true);
                }}
              >
                <MessageCircle data-icon="inline-start" />
                WhatsApp
              </Button>
            </div>
          </div>
        </div>
      </header>

      <input
        id="planilha"
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        disabled={uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <input
        id="baixas"
        ref={baixasRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        disabled={uploadingFechamento}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadFechamento(file);
        }}
      />

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-5 sm:px-6">
        {dragging ? (
          <div className="rounded-xl border-2 border-dashed border-primary bg-primary/5 px-4 py-8 text-center text-sm font-medium">
            Solte o .xlsx ou .csv para carregar os serviços
          </div>
        ) : null}

        {loadError ? (
          <Card>
            <CardHeader>
              <CardTitle>Não consegui atualizar</CardTitle>
              <CardDescription>{loadError}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button type="button" onClick={() => void load()}>
                Tentar de novo
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <StatusCard
            label="Em aberto"
            hint="ainda na fila"
            value={loading ? "…" : String(counts.aberto)}
            tone="blue"
            active={filter === "aberto"}
            onClick={() => setFilter("aberto")}
          />
          <StatusCard
            label="Faltando 1 hora"
            hint="até 1 hora"
            value={loading ? "…" : String(counts.umaHora)}
            tone="red"
            active={filter === "umaHora"}
            onClick={() => setFilter("umaHora")}
          />
          <StatusCard
            label="Faltando 2 horas"
            hint="de 1 a 2 horas"
            value={loading ? "…" : String(counts.duasHoras)}
            tone="orange"
            active={filter === "duasHoras"}
            onClick={() => setFilter("duasHoras")}
          />
          <StatusCard
            label="Faltando 3 horas"
            hint="de 2 a 3 horas"
            value={loading ? "…" : String(counts.tresHoras)}
            tone="yellow"
            active={filter === "tresHoras"}
            onClick={() => setFilter("tresHoras")}
          />
          <StatusCard
            label="Vencido"
            hint="prazo encerrado"
            value={loading ? "…" : String(counts.vencido)}
            tone="black"
            active={filter === "vencido"}
            onClick={() => setFilter("vencido")}
          />
          <StatusCard
            label="Feito"
            hint="confirmação do agente"
            value={loading ? "…" : String(counts.feito)}
            tone="green"
            active={filter === "feito"}
            onClick={() => setFilter("feito")}
          />
          <StatusCard
            label="Baixados fora do prazo"
            hint={
              fechamento
                ? `${fechamento.dentro} dentro do prazo`
                : "arquivo de baixas"
            }
            value={loading && !fechamento ? "…" : String(fechamento?.fora ?? 0)}
            tone="purple"
            active={filter === "foraPrazo"}
            onClick={() => {
              setForaPage(0);
              setFilter("foraPrazo");
            }}
          />
        </section>

        <section className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Planilha de telefones</CardTitle>
              <CardDescription>
                Ligada à planilha do Google. O nome do responsável precisa ser o mesmo da coluna
                Chefe/Responsável de Equipe.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {data?.phonesError ? (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">
                  {data.phonesError}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 text-sm">
{!data ? null : owners.length ? (
                owners.map((owner) => (
                  <Badge key={owner.telefone} variant="default">
                    Seu número · {owner.nome} · {formatPhone(owner.telefone)}
                  </Badge>
                ))
              ) : (
                <Badge variant="destructive">Nenhum número marcado como meu numero</Badge>
              )}
                {data ? (
                <Badge variant="secondary">
                  {agents.length} {agents.length === 1 ? "agente" : "agentes"} na planilha
                </Badge>
              ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void (async () => {
                      const response = await fetch("/api/phones", { cache: "no-store" });
                      const payload = (await response.json()) as { error?: string; phonesError?: string };
                      await load();
                      if (!response.ok) {
                        throw new Error(
                          payload.phonesError || payload.error || "Não foi possível atualizar os telefones.",
                        );
                      }
                      toast.success("Telefones atualizados.");
                    })().catch((error) => {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Não foi possível atualizar os telefones.",
                      );
                    });
                  }}
                >
                  <RefreshCw data-icon="inline-start" />
                  Atualizar telefones
                </Button>
                {data?.sheetUrl ? (
                  <a
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                    href={data.sheetUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink data-icon="inline-start" />
                    Abrir planilha
                  </a>
                ) : null}
              </div>
              {counts.chiefs.length ? (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium">
                    {counts.chiefs.length} responsáveis do arquivo ainda sem telefone
                  </summary>
                  <p className="mt-2 text-muted-foreground">
                    Inclua cada nome na planilha, na coluna Nome, com o telefone ao lado. Sem esse
                    par, o aviso do agente não sai. O seu número continua recebendo.
                  </p>
                  <ul className="mt-2 columns-1 gap-x-6 sm:columns-2">
                    {counts.chiefs.map((chief) => (
                      <li key={chief} className="truncate py-0.5">
                        {chief}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : counts.aberto ? (
                <p className="text-sm text-muted-foreground">
                  Todos os responsáveis deste arquivo têm telefone na planilha.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Aviso no WhatsApp</CardTitle>
              <CardDescription>
                Em cada serviço, Avisar no WhatsApp abre a conversa do responsável com o código,
                endereço, prazo e rota já escritos. Você só toca em enviar, pelo celular ou pelo
                WhatsApp Web.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {whatsappReady ? (
                <p>
                  Envio automático:{" "}
                  <strong>
                    {data?.settings.activeProvider === "meta"
                      ? "Cloud API conectada"
                      : "webhook conectado"}
                  </strong>
                </p>
              ) : null}
              <p>
                Última atualização:{" "}
                <strong>
                  {data?.lastCheckAt ? formatClock(new Date(data.lastCheckAt)) : "aguardando"}
                </strong>
              </p>
              {data?.lastCheckError ? (
                <p className="text-rose-800">{data.lastCheckError}</p>
              ) : null}
              {!data ? (
                <p className="text-muted-foreground">Carregando a lista de serviços.</p>
              ) : data.fileName ? (
                <p className="text-muted-foreground">
                  Arquivo atual: {data.fileName}
                  {data.uploadedAt ? ` · ${formatClock(new Date(data.uploadedAt))}` : ""}
                </p>
              ) : (
                <p className="text-muted-foreground">Nenhuma planilha de serviços anexada.</p>
              )}
              {fechamento ? (
                <p className="text-muted-foreground">
                  Baixas: {fechamento.fileName}
                  {` · ${formatClock(new Date(fechamento.uploadedAt))}`}
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Nenhuma planilha de baixas anexada. Use Anexar baixas no Excel com as abas TdC e
                  Linhas TdC.
                </p>
              )}
              {counts.aberto && counts.semTelefone ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-950">
                  Sem o telefone do responsável na planilha, o WhatsApp não tem para quem abrir.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </section>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" aria-label="Cores do prazo">
            {(Object.keys(URGENCY) as Urgency[]).map((key) => (
              <span key={key} className="inline-flex items-center gap-1.5 text-xs">
                <span className={cn("size-2.5 rounded-full", URGENCY[key].dot)} />
                {URGENCY[key].label}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Código, cliente, responsável ou endereço"
              className="sm:w-80"
              aria-label="Buscar serviço"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {REPORTS.map(({ value, label }) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={filter === value ? "default" : "outline"}
                onClick={() => setFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={filter === "foraPrazo" ? !fechamentoComChefe?.itens.length : rows.length === 0}
            onClick={() => {
              if (filter === "foraPrazo") {
                if (fechamentoComChefe) downloadAnalitico(fechamentoComChefe);
                return;
              }
              downloadServices(rows, reportLabel);
            }}
          >
            <Download data-icon="inline-start" />
            Baixar analítico Excel
          </Button>
        </div>

        {filter === "foraPrazo" ? (
          <FechamentoList
            fechamento={fechamentoComChefe}
            itens={foraVisible}
            total={foraItens.length}
            page={foraPageSafe}
            pageCount={foraPages}
            onPage={setForaPage}
            namesMissing={foraSemResponsavel}
            onDownload={() => {
              if (fechamentoComChefe) downloadAnalitico(fechamentoComChefe);
            }}
          />
        ) : (
          <>
        {services.length ? (
          <p className="text-sm text-muted-foreground">
            {rows.length} de {services.length}{" "}
            {services.length === 1 ? "serviço nesta lista" : "serviços nesta lista"}. Em aberto
            fica no topo. Feito continua visível e não entra na contagem do prazo.
          </p>
        ) : null}

        {loading ? (
          <Card>
            <CardContent className="grid gap-3 py-6">
              <div className="h-14 animate-pulse rounded-lg bg-muted" />
              <div className="h-14 animate-pulse rounded-lg bg-muted" />
              <div className="h-14 animate-pulse rounded-lg bg-muted" />
            </CardContent>
          </Card>
        ) : services.length === 0 ? (
          <label
            htmlFor="planilha"
            className="cursor-pointer rounded-2xl border-2 border-dashed border-border bg-card px-6 py-16 text-center"
          >
            <Upload className="mx-auto size-8 text-primary" />
            <p className="mt-3 font-heading text-2xl">Anexe a planilha de serviços</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Aceita .xlsx e .csv. O sistema lê o código do TdC, o responsável, o endereço, o
              cliente e o Prazo ANS legal.
            </p>
          </label>
        ) : rows.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Nenhum serviço neste filtro</CardTitle>
              <CardDescription>Limpe a busca ou escolha outro filtro.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <div className="hidden md:block">
              <Card className="py-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Prazo ANS legal</TableHead>
                      <TableHead>Código TdC</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead>Endereço</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(({ service, urgency, agent, alert }) => {
                      const status = serviceStatus(service);
                      return (
                      <TableRow key={service.id} className={rowTone(status, urgency)}>
                        <TableCell className="min-w-40 whitespace-normal">
                          <StatusBadge service={service} />
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <PrazoChip service={service} urgency={urgency} now={now} status={status} />
                        </TableCell>
                        <TableCell className="font-medium tabular-nums">
                          {service.codigoTdc}
                        </TableCell>
                        <TableCell className="whitespace-normal">{service.cliente}</TableCell>
                        <TableCell className="whitespace-normal">
                          <p>{service.chefe}</p>
                          <p className="text-xs text-muted-foreground">
                            {agent ? formatPhone(agent.telefone) : "sem telefone na planilha"}
                          </p>
                          {service.equipe ? (
                            <p className="text-xs text-muted-foreground">Equipe {service.equipe}</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="max-w-sm whitespace-normal">
                          <p>{service.endereco}</p>
                          <p className="text-xs text-muted-foreground">
                            {[service.municipio, service.estadoTdc].filter(Boolean).join(" · ")}
                          </p>
                          <a
                            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                            href={mapsLink(service)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <MapPin className="size-3" />
                            Abrir rota
                          </a>
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <ServiceActions
                            service={service}
                            phone={agent?.telefone ?? null}
                            message={alert?.message || (now ? buildMessage(service, now) : "")}
                            urgent={urgency === "critico"}
                            onPreview={setPreview}
                            onFeito={markServiceFeito}
                            onUndo={undoServiceFeito}
                          />
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            </div>

            <div className="grid gap-3 md:hidden">
              {rows.map(({ service, urgency, agent, alert }) => {
                const status = serviceStatus(service);
                return (
                <article
                  key={service.id}
                  className={cn("rounded-xl p-3 ring-1 ring-foreground/10", rowTone(status, urgency))}
                >
                  <div className="flex flex-col items-start gap-2">
                    <StatusBadge service={service} />
                    <PrazoChip service={service} urgency={urgency} now={now} status={status} />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">TdC {service.codigoTdc}</p>
                  <h2 className="font-heading text-lg leading-tight">{service.cliente}</h2>
                  <p className="mt-2 text-sm">{service.endereco}</p>
                  <p className="text-xs text-muted-foreground">
                    {[service.municipio, service.estadoTdc].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-2 text-sm">
                    <span className="text-muted-foreground">Responsável · </span>
                    {service.chefe}
                    {agent ? ` · ${formatPhone(agent.telefone)}` : " · sem telefone"}
                  </p>
                  {service.equipe ? (
                    <p className="text-xs text-muted-foreground">Equipe {service.equipe}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <a
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                      href={mapsLink(service)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MapPin data-icon="inline-start" />
                      Abrir rota
                    </a>
                    <ServiceActions
                      service={service}
                      phone={agent?.telefone ?? null}
                      message={alert?.message || (now ? buildMessage(service, now) : "")}
                      urgent={urgency === "critico"}
                      onPreview={setPreview}
                      onFeito={markServiceFeito}
                      onUndo={undoServiceFeito}
                    />
                  </div>
                </article>
                );
              })}
            </div>
            <div className="flex justify-end">
              <Button type="button" size="sm" variant="outline" onClick={() => downloadServices(rows, reportLabel)}>
                <Download data-icon="inline-start" />
                Baixar analítico Excel
              </Button>
            </div>
          </>
        )}
          </>
        )}

        <section className="pb-8">
          <h2 className="font-heading text-2xl">Avisos da última hora</h2>
          {!data?.alerts.length ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Quando faltar uma hora, o serviço fica em vermelho. Use Avisar no WhatsApp na linha
              dele para abrir a mensagem pronta.
            </p>
          ) : (
            <div className="mt-3 grid gap-3">
              {data.alerts.slice(0, 12).map((alert) => (
                <Card key={alert.id} size="sm">
                  <CardHeader>
                    <CardTitle>
                      TdC {alert.codigoTdc} · {ALERT_LABEL[alert.status]}
                    </CardTitle>
                    <CardDescription>
                      {alert.cliente} · {formatPrazo(alert.prazoIso)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    <ul className="text-sm">
                      {alert.deliveries.map((delivery) => (
                        <li key={`${alert.id}-${delivery.phone}`}>
                          {delivery.papel === "responsavel" ? "Você" : "Agente"} · {delivery.nome}{" "}
                          · {formatPhone(delivery.phone)} ·{" "}
                          {delivery.status === "enviado"
                            ? "enviado"
                            : delivery.status === "falhou"
                              ? `falhou (${delivery.error || "sem detalhe"})`
                              : "aguardando WhatsApp"}
                        </li>
                      ))}
                      {!alert.deliveries.length ? (
                        <li>Nenhum telefone encontrado para este serviço.</li>
                      ) : null}
                    </ul>
                    <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-sans text-xs whitespace-pre-wrap">
                      {alert.message}
                    </pre>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>

      <SettingsDialog
        key={settingsSession}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={data?.settings ?? null}
        onSaved={load}
      />

      <Dialog open={preview != null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mensagem do TdC {preview?.codigoTdc}</DialogTitle>
            <DialogDescription>
              Este texto abre no WhatsApp. Confira e toque em enviar.
            </DialogDescription>
          </DialogHeader>
          {preview ? (
            <>
              <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-sans text-sm whitespace-pre-wrap">
                {previewMessage(preview)}
              </pre>
              <WhatsAppSend
                phone={matchAgent(preview.chefe, phones)?.telefone ?? null}
                message={previewMessage(preview)}
                urgent
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function compareServices(a: Service, b: Service) {
  const rank = statusRank(serviceStatus(a)) - statusRank(serviceStatus(b));
  if (rank !== 0) return rank;
  if (serviceStatus(a) === "feito") return (b.feitoEm ?? "").localeCompare(a.feitoEm ?? "");
  return a.prazoIso.localeCompare(b.prazoIso);
}

function statusRank(status: ServiceStatus) {
  return status === "aberto" ? 0 : 1;
}

function rowTone(status: ServiceStatus, urgency: Urgency) {
  if (status === "feito") return "bg-green-50 hover:bg-green-100";
  return URGENCY[urgency].row;
}

function StatusCard({
  label,
  hint,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  value: string;
  tone?: "blue" | "red" | "orange" | "yellow" | "black" | "green" | "purple";
  active?: boolean;
  onClick?: () => void;
}) {
  const toneClass =
    tone === "blue"
      ? "text-blue-700"
      : tone === "red"
        ? "text-red-600"
        : tone === "orange"
          ? "text-orange-600"
          : tone === "yellow"
            ? "text-yellow-500"
            : tone === "black"
              ? "text-black"
              : tone === "green"
                ? "text-green-700"
                : tone === "purple"
                  ? "text-purple-700"
                  : "text-foreground";
  const barClass =
    tone === "blue"
      ? "bg-blue-600"
      : tone === "red"
        ? "bg-red-600"
        : tone === "orange"
          ? "bg-orange-500"
          : tone === "yellow"
            ? "bg-yellow-400"
            : tone === "black"
              ? "bg-black"
              : tone === "green"
                ? "bg-green-600"
                : tone === "purple"
                  ? "bg-purple-600"
                  : "bg-transparent";
  return (
    <button type="button" onClick={onClick} className="text-left">
      <Card size="sm" className={cn("h-full w-full", active && "ring-2 ring-primary")}>
        <span className={cn("block h-1.5", barClass)} />
        <CardContent>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={cn("font-heading text-3xl tabular-nums", toneClass)}>{value}</p>
          <p className="text-[0.7rem] text-muted-foreground">{hint}</p>
        </CardContent>
      </Card>
    </button>
  );
}

function FechamentoList({
  fechamento,
  itens,
  total,
  page,
  pageCount,
  onPage,
  namesMissing,
  onDownload,
}: {
  fechamento: SavedFechamento | null;
  itens: SavedFechamento["itens"];
  total: number;
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  namesMissing: boolean;
  onDownload: () => void;
}) {
  if (!fechamento) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nenhuma baixa anexada</CardTitle>
          <CardDescription>
            Use Anexar baixas e escolha o Excel com a aba TdC (Código TdC e Prazo ANS Legal) e a
            aba Linhas TdC (TdC e Data Fim).
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (!total) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nenhum serviço baixado fora do prazo</CardTitle>
          <CardDescription>
            {fechamento.dentro} baixados dentro do prazo
            {fechamento.semDataFim ? ` · ${fechamento.semDataFim} sem Data Fim` : ""}.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card className="py-0">
      {namesMissing ? (
        <p className="px-4 pt-3 text-sm text-amber-950">
          O responsável não veio neste anexo. Clique em Anexar baixas e escolha o mesmo Excel outra
          vez. O nome está na coluna Chefe/Responsável de Equipe da aba TdC.
        </p>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código TdC</TableHead>
            <TableHead>Responsável</TableHead>
            <TableHead>Prazo ANS legal</TableHead>
            <TableHead>Data fim</TableHead>
            <TableHead>Situação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {itens.map((item) => (
            <TableRow key={item.codigoTdc} className="bg-purple-50 hover:bg-purple-100">
              <TableCell className="font-medium tabular-nums">{item.codigoTdc}</TableCell>
              <TableCell className="whitespace-normal">{item.chefe || "—"}</TableCell>
              <TableCell>{formatPrazo(item.prazoIso)}</TableCell>
              <TableCell>{formatPrazo(item.fimIso)}</TableCell>
              <TableCell>
                <span className="inline-flex h-5 items-center rounded-full bg-purple-700 px-2 text-xs font-medium text-white">
                  Fora do prazo
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
        <p className="text-muted-foreground">
          {total} fora do prazo · {fechamento.dentro} dentro do prazo
          {fechamento.semDataFim ? ` · ${fechamento.semDataFim} sem Data Fim` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onDownload}>
            <Download data-icon="inline-start" />
            Baixar analítico Excel
          </Button>
          {pageCount > 1 ? (
            <>
            <Button type="button" size="sm" variant="outline" disabled={page === 0} onClick={() => onPage(page - 1)}>
              Anterior
            </Button>
            <span className="tabular-nums">
              {page + 1} / {pageCount}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page + 1 >= pageCount}
              onClick={() => onPage(page + 1)}
            >
              Próxima
            </Button>
            </>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function downloadAnalitico(fechamento: SavedFechamento) {
  const rows = fechamento.itens.map((item) => ({
    "Código TdC": item.codigoTdc,
    Responsável: item.chefe || "Não informado",
    "Prazo ANS Legal": formatPrazo(item.prazoIso),
    "Data Fim": formatPrazo(item.fimIso),
    Situação: item.fora ? "Fora do prazo" : "Dentro do prazo",
  }));
  downloadSheet(rows, "analitico_baixas", [14, 42, 20, 20, 20]);
}

function downloadServices(
  rows: { service: Service; urgency: Urgency; agent: PhoneEntry | null }[],
  report: string,
) {
  const data = rows.map(({ service, urgency, agent }) => ({
    Status: serviceStatus(service) === "feito" ? "Feito" : URGENCY[urgency].label,
    "Prazo ANS legal": formatPrazo(service.prazoIso),
    "Código TdC": service.codigoTdc,
    Cliente: service.cliente,
    Responsável: service.chefe || "Não informado",
    Telefone: agent ? formatPhone(agent.telefone) : "",
    Equipe: service.equipe,
    Endereço: service.endereco,
    Município: service.municipio,
    "Estado TdC": service.estadoTdc,
  }));
  downloadSheet(data, `analitico_${fileSlug(report)}`, [18, 20, 14, 32, 36, 18, 28, 42, 18, 14]);
}

function downloadSheet(rows: Record<string, string>[], filename: string, widths: number[]) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Analítico");
  const content = XLSX.write(book, { type: "array", bookType: "xlsx" });
  const url = URL.createObjectURL(
    new Blob([content], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}_${dateForFilename()}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

function fileSlug(label: string) {
  return label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function dateForFilename() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replace(/\//g, "-");
}

function StatusBadge({ service }: { service: Service }) {
  const status = serviceStatus(service);
  if (status === "feito") {
    return (
      <span className="inline-flex flex-col gap-0.5">
        <span className="inline-flex h-5 w-fit shrink-0 items-center rounded-full bg-green-700 px-2 text-xs font-medium whitespace-nowrap text-white">
          Feito
        </span>
        {service.feitoEm ? (
          <span className="text-[0.68rem] text-muted-foreground">
            agente · {formatClock(new Date(service.feitoEm))}
          </span>
        ) : null}
      </span>
    );
  }
  return <Badge variant="outline">Em aberto</Badge>;
}

function PrazoChip({
  service,
  urgency,
  now,
  status,
}: {
  service: Service;
  urgency: Urgency;
  now: number;
  status: ServiceStatus;
}) {
  if (status !== "aberto") {
    return (
      <div className="inline-flex min-w-36 flex-col rounded-lg bg-green-700 px-2.5 py-1.5 text-white">
        <span className="text-[0.68rem] font-semibold tracking-wide uppercase">Feito</span>
        <span className="text-sm font-semibold tabular-nums">{formatPrazo(service.prazoIso)}</span>
        <span className="text-xs opacity-90">confirmado pelo agente</span>
      </div>
    );
  }
  const style = URGENCY[urgency];
  return (
    <div className={cn("inline-flex min-w-36 flex-col rounded-lg px-2.5 py-1.5", style.chip)}>
      <span className="text-[0.68rem] font-semibold tracking-wide uppercase">{style.label}</span>
      <span className="text-sm font-semibold tabular-nums">{formatPrazo(service.prazoIso)}</span>
      <span className="text-xs opacity-90">{formatRemaining(service.prazoIso, now)}</span>
    </div>
  );
}

function ServiceActions({
  service,
  phone,
  message,
  urgent,
  onPreview,
  onFeito,
  onUndo,
}: {
  service: Service;
  phone: string | null;
  message: string;
  urgent: boolean;
  onPreview: (service: Service) => void;
  onFeito: (codigoTdc: string) => void;
  onUndo: (codigoTdc: string) => void;
}) {
  const status = serviceStatus(service);
  return (
    <div className="flex flex-col items-start gap-1.5">
      <WhatsAppSend phone={phone} message={message} urgent={urgent && status === "aberto"} />
      {status === "aberto" ? (
        <Button type="button" size="sm" onClick={() => onFeito(service.codigoTdc)}>
          <Check data-icon="inline-start" />
          Marcar feito
        </Button>
      ) : null}
      {status === "feito" ? (
        <Button type="button" size="sm" variant="outline" onClick={() => onUndo(service.codigoTdc)}>
          <Undo2 data-icon="inline-start" />
          Desfazer feito
        </Button>
      ) : null}
      <Button type="button" size="xs" variant="ghost" onClick={() => onPreview(service)}>
        Ver texto
      </Button>
    </div>
  );
}

function WhatsAppSend({
  phone,
  message,
  urgent,
}: {
  phone: string | null;
  message: string;
  urgent: boolean;
}) {
  if (!phone) {
    return (
      <Button type="button" size="sm" variant="outline" disabled>
        Sem telefone
      </Button>
    );
  }
  return (
    <a
      className={buttonVariants({ variant: urgent ? "default" : "outline", size: "sm" })}
      href={whatsappLink(phone, message)}
      target="_blank"
      rel="noreferrer"
    >
      <MessageCircle data-icon="inline-start" />
      Avisar no WhatsApp
    </a>
  );
}
