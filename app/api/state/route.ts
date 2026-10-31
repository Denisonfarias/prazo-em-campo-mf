import { publicState } from "@/lib/alerts";
import { readSnapshot } from "@/lib/store";

export function GET() {
  return Response.json(publicState(readSnapshot()), {
    headers: { "Cache-Control": "no-store" },
  });
}
