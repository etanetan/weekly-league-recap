import { createBrowserClient } from "@supabase/ssr";

function makeRealClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

type SupabaseBrowser = ReturnType<typeof makeRealClient>;

// Mirrors lib/supabase/server.ts: in development, return a stub when env
// vars are missing so /login and /signup don't crash on click. The stub
// only supports auth methods (the only thing the browser uses); each call
// returns a clear error so the developer sees what's missing.
function devStub(): SupabaseBrowser {
  const err = { message: "Supabase disabled (no NEXT_PUBLIC_SUPABASE_* env vars set)" };
  return {
    auth: {
      signUp: async () => ({ data: null, error: err }),
      signInWithPassword: async () => ({ data: null, error: err }),
      signInWithOAuth: async () => ({ data: null, error: err }),
      signOut: async () => ({ error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  } as unknown as SupabaseBrowser;
}

export function getSupabaseBrowser(): SupabaseBrowser {
  if (
    process.env.NODE_ENV !== "production" &&
    (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  ) {
    return devStub();
  }
  return makeRealClient();
}
