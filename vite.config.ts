import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: true,
    },
    proxy: {
      '/api': 'http://localhost:3000',
      '/sms': 'http://localhost:3000',
      '/voice': 'http://localhost:3000',
      '/collect-1': 'http://localhost:3000',
      '/collect-2': 'http://localhost:3000',
      '/collect-3': 'http://localhost:3000',
      '/collect-4': 'http://localhost:3000',
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
