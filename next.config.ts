import type { NextConfig } from "next";

// Derived from the configured Supabase project so this works in every
// environment (local: http://127.0.0.1:54321, production: an https://*.supabase.co
// URL) without editing this file per deploy. Scoped to the storage path only.
const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321");
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
};

export default nextConfig;
