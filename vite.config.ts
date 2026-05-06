import { defineConfig } from "vite";
import { glob } from "glob";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// One Vite entry per source file so the dist/ tree mirrors scripts/.
// Bitburner's RAM accounting walks `import` chains across files, so we
// deliberately do NOT collapse multiple files into a single bundle —
// that would shift RAM costs in non-obvious ways.
const root = fileURLToPath(new URL(".", import.meta.url));
const entries = Object.fromEntries(
  glob.sync("scripts/**/*.{ts,tsx,js,jsx}").map((file) => [
    file.slice("scripts/".length).replace(/\.(ts|tsx|js|jsx)$/, ""),
    resolve(root, file),
  ]),
);

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    minify: false,
    sourcemap: false,
    // Each scripts/ file is a Bitburner script — its `export async function main`
    // is invoked by the game, not by another module. Without this, Rollup
    // tree-shakes the export away and emits an empty file.
    rollupOptions: {
      input: entries,
      preserveEntrySignatures: "strict",
      // Bitburner's runtime provides these; bundling them would either fail
      // or duplicate the game's own copy.
      external: ["react", "react-dom"],
      output: {
        format: "es",
        entryFileNames: "[name].js",
        chunkFileNames: "_chunks/[name]-[hash].js",
      },
    },
  },
});
