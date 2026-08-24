import type { NextConfig } from "next";

// Derived from the configured Supabase project so this works in every
// environment (local: http://127.0.0.1:54321, production: an https://*.supabase.co
// URL) without editing this file per deploy. Scoped to the storage path only.
//
// Guarded with a try/catch, not just `?? fallback`: an *unset* env var is
// `undefined` and falls back fine, but a platform that predeclares the
// variable with an empty value (seen on Vercel) leaves it as `""` — not
// nullish, so `??` never catches it, and `new URL("")` throws and fails the
// entire build before a single page can be built.
function resolveSupabaseUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    if (!raw) throw new Error("empty");
    return new URL(raw);
  } catch {
    return new URL("http://127.0.0.1:54321");
  }
}

const supabaseUrl = resolveSupabaseUrl();
const isLocalSupabase = ["127.0.0.1", "localhost"].includes(supabaseUrl.hostname);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: supabaseUrl.protocol === "https:" ? "https" : "http",
        hostname: supabaseUrl.hostname,
        port: supabaseUrl.port,
        pathname: "/storage/v1/object/**",
      },
    ],
    // Next.js refuses to optimize images from a private IP by default (SSRF
    // protection). Only needed for the local Supabase stack — a production
    // Supabase URL is a public hostname, so this stays off there.
    ...(isLocalSupabase ? { dangerouslyAllowLocalIP: true } : {}),
  },
  experimental: {
    serverActions: {
      // Next's default is 1MB — too small for this app's own document
      // upload (src/features/documents/actions.ts caps files at 20MB).
      // Set just above that cap, not "big enough for anything": Server
      // Actions run in the same request/response cycle as the page, so an
      // unbounded body limit is a denial-of-service surface, not a
      // convenience.
      bodySizeLimit: "21mb",
    },
  },
};

export default nextConfig;
