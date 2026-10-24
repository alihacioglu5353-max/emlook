import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Panel tamamen oturuma bağlı ve etkileşimli; sayfalar istemci bileşeni,
  // veri sunucu tarafı köprü (src/app/api/*) üzerinden gelir.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  poweredByHeader: false,
};

export default nextConfig;
