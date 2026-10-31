import { refreshPhones } from "@/lib/alerts";

export async function POST() {
  const result = await refreshPhones(true);
  if (result.phonesError && result.phones.length === 0) {
    return Response.json({ error: result.phonesError, ...result }, { status: 502 });
  }
  return Response.json({ ok: true, ...result });
}
