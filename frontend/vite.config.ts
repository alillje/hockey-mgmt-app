import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api":
        loadEnv(mode, ".", "HOCKEY_").HOCKEY_API_URL || "http://127.0.0.1:5180",
    },
  },
}));
