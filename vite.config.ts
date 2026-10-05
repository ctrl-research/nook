import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative base so the static build works from any path (e.g. GitHub Pages project sites).
  base: "./",
  plugins: [react()],
  // MapLibre's worker is loaded as an ES module.
  worker: { format: "es" },
  // Serve MapLibre unbundled in dev so it can find its sibling worker module.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  test: {
    environment: "node",
  },
});
