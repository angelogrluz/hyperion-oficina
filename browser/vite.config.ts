import { writeFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

const root = path.resolve(__dirname, "..");
const buildId = new Date().toISOString();

function versionJson(): Plugin {
  return {
    name: "hyperion-version",
    config() {
      return { define: { __APP_VERSION__: JSON.stringify(buildId) } };
    },
    closeBundle() {
      writeFileSync(
        path.resolve(__dirname, "dist/version.json"),
        `${JSON.stringify({ id: buildId, builtAt: buildId, revision: 7 }, null, 2)}\n`,
      );
    },
  };
}

export default defineConfig({
  root: __dirname,
  base: "/hyperion-oficina/",
  plugins: [react(), tailwindcss(), versionJson()],
  resolve: {
    alias: [
      { find: "@/app/actions/auth", replacement: path.resolve(__dirname, "src/shims/auth.ts") },
      { find: "@/app/actions/documents", replacement: path.resolve(__dirname, "src/shims/documents.ts") },
      { find: "@/app/actions/records", replacement: path.resolve(__dirname, "src/shims/records.ts") },
      { find: "@/app/actions/purchases", replacement: path.resolve(__dirname, "src/shims/purchases.ts") },
      { find: "@/app/actions/appointments", replacement: path.resolve(__dirname, "src/shims/appointments.ts") },
      { find: "@/app/actions/plates", replacement: path.resolve(__dirname, "src/shims/plates.ts") },
      { find: "next/link", replacement: path.resolve(__dirname, "src/shims/link.tsx") },
      { find: "next/navigation", replacement: path.resolve(__dirname, "src/shims/navigation.tsx") },
      { find: "@", replacement: root },
    ],
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
});
