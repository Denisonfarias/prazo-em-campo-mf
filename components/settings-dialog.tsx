"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type SettingsView = {
  extraOwnerPhone: string;
  provider: "none" | "meta" | "webhook";
  metaPhoneNumberId: string;
  webhookUrl: string;
  hasMetaToken: boolean;
  hasWebhookToken: boolean;
  activeProvider: "none" | "meta" | "webhook";
  activeSource: "ambiente" | "painel" | "nenhuma";
};

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: SettingsView | null;
  onSaved: () => Promise<void> | void;
}) {
  const [extraOwnerPhone, setExtraOwnerPhone] = useState(settings?.extraOwnerPhone ?? "");
  const [provider, setProvider] = useState<SettingsView["provider"]>(settings?.provider ?? "none");
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState(settings?.metaPhoneNumberId ?? "");
  const [metaToken, setMetaToken] = useState("");
  const [webhookUrl, setWebhookUrl] = useState(settings?.webhookUrl ?? "");
  const [webhookToken, setWebhookToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extraOwnerPhone,
          provider,
          metaPhoneNumberId,
          metaToken,
          webhookUrl,
          webhookToken,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar.");
      toast.success("Configuração salva.");
      await onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const response = await fetch("/api/alerts/test", { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "O teste não saiu.");
      toast.success("Mensagem de teste enviada para o seu número.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "O teste não saiu.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>WhatsApp e o seu número</DialogTitle>
          <DialogDescription>
            O caminho normal é o botão Avisar no WhatsApp, em cada serviço. Esta tela só serve se
            você quiser que uma API envie sozinha, além desse botão.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Número adicional</span>
            <Input
              value={extraOwnerPhone}
              onChange={(event) => setExtraOwnerPhone(event.target.value)}
              placeholder="85 99999-9999"
              inputMode="tel"
            />
            <span className="text-xs text-muted-foreground">
              Opcional. Recebe a mesma mensagem, além de quem está na planilha.
            </span>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium">Como enviar</span>
            <select
              className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
              value={provider}
              onChange={(event) =>
                setProvider(event.target.value as SettingsView["provider"])
              }
            >
              <option value="none">Ainda não configurado</option>
              <option value="meta">WhatsApp Cloud API (Meta)</option>
              <option value="webhook">Webhook (Z-API, Evolution ou n8n)</option>
            </select>
          </label>

          {provider === "meta" ? (
            <>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">ID do número</span>
                <Input
                  value={metaPhoneNumberId}
                  onChange={(event) => setMetaPhoneNumberId(event.target.value)}
                  placeholder="Phone number ID"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Token de acesso</span>
                <Input
                  type="password"
                  value={metaToken}
                  onChange={(event) => setMetaToken(event.target.value)}
                  placeholder={settings?.hasMetaToken ? "Token já salvo" : "Cole o token"}
                  autoComplete="off"
                />
              </label>
            </>
          ) : null}

          {provider === "webhook" ? (
            <>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">URL de envio</span>
                <Input
                  value={webhookUrl}
                  onChange={(event) => setWebhookUrl(event.target.value)}
                  placeholder="https://..."
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Token, se a API pedir</span>
                <Input
                  type="password"
                  value={webhookToken}
                  onChange={(event) => setWebhookToken(event.target.value)}
                  placeholder={settings?.hasWebhookToken ? "Token já salvo" : "Opcional"}
                  autoComplete="off"
                />
              </label>
              <p className="text-xs text-muted-foreground">
                O sistema envia um JSON com phone, number, message e text. Na Z-API, use a URL
                send-text da instância. O token, se preenchido, vai no cabeçalho Client-Token.
              </p>
            </>
          ) : null}

          {settings?.activeSource === "ambiente" ? (
            <p className="rounded-lg bg-secondary px-3 py-2 text-xs">
              Há credenciais no ambiente do servidor. Elas valem mais do que o que está neste
              painel.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={sendTest} disabled={testing || saving}>
            {testing ? "Enviando teste..." : "Enviar teste"}
          </Button>
          <Button type="button" onClick={save} disabled={saving || testing}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
