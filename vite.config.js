import { defineConfig } from "vite";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

function offlineShell() {
  const template = readFileSync(new URL("./src/sw.js", import.meta.url), "utf8");
  return {
    name: "toolbox-offline-shell",
    apply: "build",
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const icons = readdirSync(new URL("./public/icons/", import.meta.url));
        const tiles = readdirSync(new URL("./public/assets/tiles/", import.meta.url));
        const staticAssets = [
          "manifest.json",
          ...icons.map((file) => `icons/${file}`),
          ...tiles.map((file) => `assets/tiles/${file}`),
          "assets/night-ar/milky-way-band.png",
        ];
        const assets = [...new Set(["index.html", ...Object.keys(bundle), ...staticAssets])].sort();
        const hash = createHash("sha256").update(template).update(JSON.stringify(assets))
          .update(String(bundle["index.html"]?.source || ""));
        for (const file of staticAssets) hash.update(readFileSync(new URL(`./public/${file}`, import.meta.url)));
        const version = hash.digest("hex").slice(0, 12);
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: template.replace("__BUILD_VERSION__", version).replace("__BUILD_ASSETS__", JSON.stringify(assets)),
        });
      },
    },
  };
}

// Project site on GitHub Pages: https://<user>.github.io/The-Photographers-Toolbox/
export default defineConfig({
  base: "/The-Photographers-Toolbox/",
  plugins: [offlineShell()],
  build: {
    outDir: "dist",
  },
});
