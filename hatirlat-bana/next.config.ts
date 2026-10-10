import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: ["web-push"],
  // Hangi sürümün çalıştığını uygulamada görebilmek için (Vercel commit SHA)
  env: { NEXT_PUBLIC_COMMIT: (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || "yerel").slice(0, 7) },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
