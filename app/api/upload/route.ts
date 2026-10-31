import { runAlertCheck, saveServices } from "@/lib/alerts";
import { parseUpload } from "@/lib/parse-services";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Anexe um arquivo .xlsx ou .csv." }, { status: 400 });
  }
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls") && !lower.endsWith(".csv")) {
    return Response.json(
      { error: "Use um arquivo Excel (.xlsx) ou CSV (.csv)." },
      { status: 400 },
    );
  }
  if (file.size > 8 * 1024 * 1024) {
    return Response.json({ error: "O arquivo passa de 8 MB." }, { status: 400 });
  }

  try {
    const services = parseUpload(file.name, Buffer.from(await file.arrayBuffer()));
    await saveServices(file.name, services);
    const check = await runAlertCheck();
    return Response.json({ ok: true, count: services.length, check });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível ler o arquivo.";
    return Response.json({ error: message }, { status: 400 });
  }
}
