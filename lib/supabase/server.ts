import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

async function makeRealClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // setAll is called from a Server Component — cookies can't be set
            // here but middleware (if configured) will refresh tokens.
          }
        },
      },
    },
  );
}

// Canonical client type, inferred from the real client call so generic
// parameters propagate to call sites (typed .from() rows, etc.).
type SupabaseServer = Awaited<ReturnType<typeof makeRealClient>>;

// In development, allow the app to boot without Supabase env vars by
// returning a stub that treats every request as logged-out and no-ops
// persistence. The recap generation flow (POST /api/recap) still works
// for anonymous users, which is what we want for local end-to-end testing.
//
// Gated on NODE_ENV !== "production" so a misconfigured production deploy
// still fails loudly instead of silently dropping writes.
function devStub(): SupabaseServer {
  const noUser = async () => ({ data: { user: null }, error: null });
  type Chain = {
    select: (...args: unknown[]) => Chain;
    insert: (...args: unknown[]) => Chain;
    upsert: (...args: unknown[]) => Chain;
    update: (...args: unknown[]) => Chain;
    delete: (...args: unknown[]) => Chain;
    eq: (...args: unknown[]) => Chain;
    order: (...args: unknown[]) => Chain;
    limit: (...args: unknown[]) => Chain;
    single: (...args: unknown[]) => Chain;
    then: <R1, R2>(
      onFulfilled?: (v: { data: null; error: null }) => R1 | PromiseLike<R1>,
      onRejected?: (reason: unknown) => R2 | PromiseLike<R2>,
    ) => Promise<R1 | R2>;
  };
  const fromStub = (): Chain => {
    const result = Promise.resolve({ data: null, error: null });
    const chain: Chain = {
      select: () => chain,
      insert: () => chain,
      upsert: () => chain,
      update: () => chain,
      delete: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      single: () => chain,
      then: (onFulfilled, onRejected) => result.then(onFulfilled, onRejected),
    };
    return chain;
  };
  return {
    auth: {
      getUser: noUser,
      exchangeCodeForSession: async () => ({
        error: { message: "Supabase disabled (no env vars set)" },
      }),
    },
    from: fromStub,
  } as unknown as SupabaseServer;
}

export async function getSupabaseServer(): Promise<SupabaseServer> {
  if (
    process.env.NODE_ENV !== "production" &&
    (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  ) {
    return devStub();
  }
  return makeRealClient();
}
