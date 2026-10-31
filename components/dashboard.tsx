"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ExternalLink,
  MapPin,
  MessageCircle,
  RefreshCw,
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
import type { Alert, PhoneEntry, Service, Urgency } from "@/lib/types";
import { cn } from "@/lib/utils";

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

type Filter = "todos" | "vencido" | "critico" | "ate8h" | "semTelefone";

const URGENCY: Record<
  Urgency,
  { label: string; row: string; chip: string; dot: string }
> = {
  vencido: {
    label: "Vencido",
    row: "bg-rose-50 hover:bg-rose-100",
    chip: "bg-rose-800 text-white",
    dot: "bg-rose-700",
  },
  critico: {
    label: "Menos de 1 hora",
    row: "bg-red-50 hover:bg-red-100",
    chip: "bg-red-600 text-white",
    dot: "bg-red-600",
  },
  alerta: {
    label: "Até 3 horas",
    row: "bg-orange-50 hover:bg-orange-100",
    chip: "bg-orange-600 text-white",
    dot: "bg-orange-500",
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
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preview, setPreview] = useState<Service | null>(null);
  const [settingsSession, setSettingsSession] = useState(0);
  const now = useNow();
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível carregar o acompanhamento.");
    setData((await response.json()) as StatePayload);
    setLoadError(null);
  }, []);

  const check = useCallback(async () => {
    await fetch("/api/alerts/check", { method: "POST" }).catch(() => undefined);
    await load();
  }, [load]);

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
      if (cancelled) return;
      try {
        await check();
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Falha ao atualizar.");
        }
      }
    })();
    const poll = setInterval(() => {
      void check().catch((error) => {
        setLoadError(error instanceof Error ? error.message : "Falha ao atualizar.");
      });
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [check, load]);

  async function upload(file: File) {
    const body = new FormData();
    body.set("file", file);
    setUploading(true);
    try {
      const response = await fetch("/api/upload", { method: "POST", body });
      const payload = (await response.json()) as { error?: string; count?: number };
      if (!response.ok) throw new Error(payload.error || "Não foi possível ler o arquivo.");
      toast.success(`${payload.count} serviços carregados.`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler o arquivo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const services = useMemo(() => data?.services ?? [], [data?.services]);
  const phones = useMemo(() => data?.phones ?? [], [data?.phones]);
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
        if (filter === "vencido" && urgency !== "vencido") return false;
        if (filter === "critico" && urgency !== "critico") return false;
        if (
          filter === "ate8h" &&
          urgency !== "critico" &&
          urgency !== "alerta" &&
          urgency !== "atencao"
        ) {
          return false;
        }
        if (filter === "semTelefone" && agent) return false;
        if (!term) return true;
        const haystack = [
          service.codigoTdc,
          service.cliente,
          service.chefe,
          service.endereco,
          service.municipio,
        ]
          .join(" ")
          .toLocaleLowerCase("pt-BR");
        return haystack.includes(term);
      })
      .sort((a, b) => a.service.prazoIso.localeCompare(b.service.prazoIso));
  }, [data?.alerts, filter, now, phones, query, services]);

  const counts = useMemo(() => {
    const tally = { total: services.length, vencido: 0, critico: 0, ate8h: 0, semTelefone: 0 };
    const missing = new Set<string>();
    for (const service of services) {
      const urgency = urgencyOf(service.prazoIso, now);
      if (urgency === "vencido") tally.vencido += 1;
      if (urgency === "critico") tally.critico += 1;
      if (urgency === "critico" || urgency === "alerta" || urgency === "atencao") tally.ate8h += 1;
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
              Os serviços entram pelo Excel ou CSV. A cor mostra quem está mais perto de vencer.
              O botão abre o WhatsApp do responsável com a mensagem pronta, e você só confirma o
              envio.
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
              <Button
                type="button"
                variant="secondary"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <Upload data-icon="inline-start" />
                {uploading ? "Lendo arquivo..." : "Anexar planilha"}
              </Button>
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
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
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
              <Button type="button" onClick={() => void check()}>
                Tentar de novo
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatusCard label="Serviços" value={loading ? "…" : String(counts.total)} />
          <StatusCard label="Vencidos" value={loading ? "…" : String(counts.vencido)} tone="rose" />
          <StatusCard
            label="Menos de 1 hora"
            value={loading ? "…" : String(counts.critico)}
            tone="red"
          />
          <StatusCard
            label="Sem telefone do responsável"
            value={loading ? "…" : String(counts.semTelefone)}
            tone="amber"
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
                      const response = await fetch("/api/phones/refresh", { method: "POST" });
                      const payload = (await response.json()) as { error?: string };
                      await load();
                      if (!response.ok) {
                        throw new Error(payload.error || "Não foi possível atualizar os telefones.");
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
              ) : services.length ? (
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
                Em cada serviço, Avisar no WhatsApp abre a conversa do responsável com cliente,
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
              {services.length && counts.semTelefone ? (
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

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["todos", "Todos"],
              ["vencido", "Vencidos"],
              ["critico", "Menos de 1 h"],
              ["ate8h", "Até 8 h"],
              ["semTelefone", "Sem telefone"],
            ] as const
          ).map(([value, label]) => (
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

        {loading ? (
          <Card>
            <CardContent className="grid gap-3 py-6">
              <div className="h-14 animate-pulse rounded-lg bg-muted" />
              <div className="h-14 animate-pulse rounded-lg bg-muted" />
              <div className="h-14 animate-pulse rounded-lg bg-muted" />
            </CardContent>
          </Card>
        ) : services.length === 0 ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-2xl border-2 border-dashed border-border bg-card px-6 py-16 text-center"
          >
            <Upload className="mx-auto size-8 text-primary" />
            <p className="mt-3 font-heading text-2xl">Anexe a planilha de serviços</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Aceita .xlsx e .csv. O sistema lê o código do TdC, o responsável, o endereço, o
              cliente e o Prazo ANS legal.
            </p>
          </button>
        ) : rows.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Nenhum serviço neste filtro</CardTitle>
              <CardDescription>Limpe a busca ou escolha Todos.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <div className="hidden md:block">
              <Card className="py-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Prazo ANS legal</TableHead>
                      <TableHead>Código TdC</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead>Endereço</TableHead>
                      <TableHead>Aviso</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(({ service, urgency, agent, alert }) => (
                      <TableRow key={service.id} className={URGENCY[urgency].row}>
                        <TableCell className="whitespace-normal">
                          <PrazoChip service={service} urgency={urgency} now={now} />
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
                        </TableCell>
                        <TableCell className="max-w-sm whitespace-normal">
                          <p>{service.endereco}</p>
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
                          <div className="flex flex-col items-start gap-1.5">
                            <WhatsAppSend
                              phone={agent?.telefone ?? null}
                              message={alert?.message || (now ? buildMessage(service, now) : "")}
                              urgent={urgency === "critico"}
                            />
                            <Button
                              type="button"
                              size="xs"
                              variant="ghost"
                              onClick={() => setPreview(service)}
                            >
                              Ver texto
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>

            <div className="grid gap-3 md:hidden">
              {rows.map(({ service, urgency, agent, alert }) => (
                <article
                  key={service.id}
                  className={cn("rounded-xl p-3 ring-1 ring-foreground/10", URGENCY[urgency].row)}
                >
                  <PrazoChip service={service} urgency={urgency} now={now} />
                  <p className="mt-3 text-xs text-muted-foreground">TdC {service.codigoTdc}</p>
                  <h2 className="font-heading text-lg leading-tight">{service.cliente}</h2>
                  <p className="mt-2 text-sm">{service.endereco}</p>
                  <p className="mt-2 text-sm">
                    <span className="text-muted-foreground">Responsável · </span>
                    {service.chefe}
                    {agent ? ` · ${formatPhone(agent.telefone)}` : " · sem telefone"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                      href={mapsLink(service)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MapPin data-icon="inline-start" />
                      Abrir rota
                    </a>
                    <WhatsAppSend
                      phone={agent?.telefone ?? null}
                      message={alert?.message || (now ? buildMessage(service, now) : "")}
                      urgent={urgency === "critico"}
                    />
                    <Button type="button" size="sm" variant="ghost" onClick={() => setPreview(service)}>
                      Ver texto
                    </Button>
                  </div>
                </article>
              ))}
            </div>
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

function StatusCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "rose" | "red" | "amber";
}) {
  const toneClass =
    tone === "rose"
      ? "text-rose-800"
      : tone === "red"
        ? "text-red-700"
        : tone === "amber"
          ? "text-amber-800"
          : "text-foreground";
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("font-heading text-3xl tabular-nums", toneClass)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function PrazoChip({
  service,
  urgency,
  now,
}: {
  service: Service;
  urgency: Urgency;
  now: number;
}) {
  const style = URGENCY[urgency];
  return (
    <div className={cn("inline-flex min-w-36 flex-col rounded-lg px-2.5 py-1.5", style.chip)}>
      <span className="text-[0.68rem] font-semibold tracking-wide uppercase">{style.label}</span>
      <span className="text-sm font-semibold tabular-nums">{formatPrazo(service.prazoIso)}</span>
      <span className="text-xs opacity-90">{formatRemaining(service.prazoIso, now)}</span>
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
