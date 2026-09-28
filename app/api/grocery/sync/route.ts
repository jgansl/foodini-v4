import { revalidatePath } from "next/cache";
import { applyGroceryChanges } from "@/db/queries/grocery";
import { parseSyncBody } from "@/lib/offline-queue";
import { getUser } from "@/server/auth";

/** Applies a batch of offline check-offs. See lib/offline-queue.ts for the change format. */
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "signed-out" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const parsed = parseSyncBody(body);
  if (!parsed.ok) return Response.json({ error: "invalid" }, { status: 400 });
  const results = await applyGroceryChanges(user.id, parsed.changes);
  revalidatePath("/list");
  return Response.json({ results });
}
