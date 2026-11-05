import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["pdfkit", "bcryptjs"],
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
