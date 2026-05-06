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
  // Redirect `import "react"` etc. to local shims that pull from globalThis.
  // User code looks like a normal React app; the bundle inlines the shims so
  // Bitburner's runtime never has to resolve a "react" specifier.
  resolve: {
    // Regex form because Rolldown's alias matcher treats specifiers with
    // slashes (`react/jsx-runtime`) as filesystem paths in the string form.
    alias: [
      { find: /^react$/, replacement: resolve(root, "tools/react-shim.ts") },
      { find: /^react-dom$/, replacement: resolve(root, "tools/react-dom-shim.ts") },
      {
        find: /^react\/jsx-(dev-)?runtime$/,
        replacement: resolve(root, "tools/react-jsx-runtime-shim.ts"),
      },
    ],
  },
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
      output: {
        format: "es",
        entryFileNames: "[name].js",
        chunkFileNames: "_chunks/[name]-[hash].js",
      },
    },
  },
});
