export type ServiceStatus = "aberto" | "feito";

export type Service = {
  id: string;
  codigoTdc: string;
  chefe: string;
  endereco: string;
  cliente: string;
  prazoIso: string;
  lat: number | null;
  lng: number | null;
  municipio: string;
  estadoTdc: string;
  equipe: string;
  status?: ServiceStatus;
  feitoEm?: string | null;
  noArquivoAtual?: boolean;
};

export type PhonePapel = "responsavel" | "agente";

export type PhoneEntry = {
  nome: string;
  telefone: string;
  telefoneOriginal: string;
  info: string;
  papel: PhonePapel;
};

export type DeliveryStatus = "enviado" | "falhou" | "sem_whatsapp";

export type Delivery = {
  papel: "agente" | "responsavel";
  nome: string;
  phone: string;
  status: DeliveryStatus;
  error?: string;
  at: string;
};

export type AlertStatus =
  | "enviado"
  | "parcial"
  | "falhou"
  | "sem_whatsapp"
  | "sem_destinatario";

export type Alert = {
  id: string;
  key: string;
  codigoTdc: string;
  prazoIso: string;
  cliente: string;
  chefe: string;
  endereco: string;
  message: string;
  status: AlertStatus;
  deliveries: Delivery[];
  updatedAt: string;
};

export type WhatsAppProvider = "none" | "meta" | "webhook";

export type WhatsAppConfig = {
  provider: WhatsAppProvider;
  metaToken: string;
  metaPhoneNumberId: string;
  webhookUrl: string;
  webhookToken: string;
};

export type StoreData = {
  fileName: string | null;
  uploadedAt: string | null;
  services: Service[];
  alerts: Alert[];
  extraOwnerPhone: string;
  whatsapp: WhatsAppConfig;
  phones: PhoneEntry[];
  phonesFetchedAt: string | null;
  phonesError: string | null;
  lastCheckAt: string | null;
  lastCheckError: string | null;
};

export type Urgency =
  | "vencido"
  | "critico"
  | "duasHoras"
  | "tresHoras"
  | "atencao"
  | "folga"
  | "ok";
