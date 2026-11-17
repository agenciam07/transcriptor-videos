import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy hacia Supabase: el navegador solo habla con este dominio (ver src/lib/supabase/client.ts).
  async rewrites() {
    return [
      {
        source: "/supabase/:path*",
        destination: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/:path*`,
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
