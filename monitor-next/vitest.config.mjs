import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Mirrors jsconfig.json's "@/*" -> "./*" alias so tests can import the same
// way the app does ("@/lib/logic", "@/components/Header", etc.).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.mjs"],
    include: ["**/*.test.{js,jsx}"],
    exclude: ["node_modules", ".next", "out"]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, ".")
    }
  }
});
