import { defineConfig } from "vite";

// Site estatico: base relativa para funcionar em qualquer caminho na Vercel.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    target: "es2020",
    sourcemap: false,
  },
  server: {
    host: true,
  },
});
