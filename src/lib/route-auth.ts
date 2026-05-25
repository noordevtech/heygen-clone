import { NextResponse } from "next/server";
import { getSessionUser, type AuthUser } from "./auth";
import { runWithUser } from "./user-context";

/**
 * Tiny higher-order helper for API routes that need an authenticated user
 * AND want the provider resolver (`resolved.X()`) to look up that user's
 * settings. Resolves the session, returns 401 if absent, otherwise runs
 * the handler inside `runWithUser(me.id, ...)` so AsyncLocalStorage carries
 * the user through every helper call.
 *
 * Use at the top of an API route:
 *
 *   export async function POST(req: NextRequest) {
 *     return withUser(async (me) => {
 *       // …existing handler logic. `resolved.X()` now uses me's settings.
 *     });
 *   }
 */
export async function withUser<T>(
  fn: (user: AuthUser) => Promise<T>,
): Promise<T | NextResponse> {
  const me = await getSessionUser();
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runWithUser(me.id, () => fn(me));
}
