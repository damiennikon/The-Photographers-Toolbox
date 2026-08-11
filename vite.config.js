import { defineConfig } from "vite";

// Project site on GitHub Pages: https://<user>.github.io/The-Photographers-Toolbox/
export default defineConfig({
  base: "/The-Photographers-Toolbox/",
  build: {
    outDir: "dist",
  },
});
