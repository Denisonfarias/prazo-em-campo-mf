import type { Service, ServiceStatus } from "@/lib/types";

export function serviceStatus(service: Service): ServiceStatus {
  const status = service.status as string | undefined;
  if (status === "feito" || status === "concluido") return "feito";
  return "aberto";
}

export function isOpenWork(service: Service): boolean {
  return serviceStatus(service) === "aberto" && service.noArquivoAtual !== false;
}

export function mergeUpload(previous: Service[], incoming: Service[], at: string) {
  const previousByCode = new Map(previous.map((service) => [service.codigoTdc, service]));
  const incomingCodes = new Set(incoming.map((service) => service.codigoTdc));
  const services: Service[] = incoming.map((service) => {
    const prior = previousByCode.get(service.codigoTdc);
    const staysDone = prior ? serviceStatus(prior) === "feito" : false;
    return {
      ...service,
      id: prior?.id ?? service.id,
      status: staysDone ? "feito" : "aberto",
      feitoEm: staysDone ? prior?.feitoEm ?? at : null,
      noArquivoAtual: true,
    };
  });

  let removidos = 0;
  for (const prior of previous) {
    if (incomingCodes.has(prior.codigoTdc)) continue;
    if (serviceStatus(prior) === "feito") {
      services.push({ ...prior, status: "feito", noArquivoAtual: false });
    } else {
      removidos += 1;
    }
  }

  return { services, removidos };
}

export function markFeito(services: Service[], codigoTdc: string, at: string): Service[] {
  return services.map((service) =>
    service.codigoTdc === codigoTdc && serviceStatus(service) === "aberto"
      ? { ...service, status: "feito", feitoEm: at }
      : service,
  );
}

export function undoFeito(services: Service[], codigoTdc: string): Service[] {
  return services.map((service) =>
    service.codigoTdc === codigoTdc && serviceStatus(service) === "feito"
      ? { ...service, status: "aberto", feitoEm: null }
      : service,
  );
}
