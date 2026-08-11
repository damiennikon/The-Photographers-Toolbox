import { defineConfig } from "vite";

// Project site on GitHub Pages: https://<user>.github.io/photographers-toolbox/
export default defineConfig({
  base: "/photographers-toolbox/",
  build: {
    outDir: "dist",
  },
});
