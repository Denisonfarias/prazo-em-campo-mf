import { fetchPhoneSheet } from "@/lib/phones";

export async function GET() {
  try {
    const phones = await fetchPhoneSheet();
    return Response.json(
      {
        phones,
        phonesFetchedAt: new Date().toISOString(),
        phonesError: null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao ler a planilha de telefones";
    return Response.json(
      { phones: [], phonesFetchedAt: null, phonesError: message },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
