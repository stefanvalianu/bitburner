/**
 * dependency-cruiser config. Runs as part of `just build` via the `depcheck`
 * pnpm script. Add architectural import rules under `forbidden`; tsconfig
 * paths (including `@root/*`) are resolved automatically.
 *
 * Docs: https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
 */
module.exports = {
  forbidden: [
    // Rule shape — fill in once we decide on the layering policy:
    // {
    //   name: "info-no-react",
    //   severity: "error",
    //   from: { path: "src/lib/util/tasks/.+/info\\.ts$" },
    //   to:   { path: "(features/components|features/ns|features/theme|\\.tsx$)" },
    // },
  ],
  options: {
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(dist|node_modules|tools)(/|$)" },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
