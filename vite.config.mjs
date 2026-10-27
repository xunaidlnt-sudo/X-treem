import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: { input: { studio: "index.html", guest: "guest.html" } },
  },
  server: {
    watch: { ignored: ["**/build/**", "**/release/**", "**/work/**"] },
  },
});
