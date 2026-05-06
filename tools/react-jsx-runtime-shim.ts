// Build-time shim for the automatic JSX runtime. With `jsx: "react-jsx"` in
// tsconfig, esbuild emits `import { jsx } from "react/jsx-runtime"` for every
// JSX expression. Bitburner doesn't expose `react/jsx-runtime` as a module —
// only the React global — so we translate jsx() calls into createElement().
//
// This is a deliberate simplification of React's real jsx-runtime. It covers
// every standard JSX form (elements, fragments, keyed lists, children arrays).
// If you ever hit a corner case, debugging starts here.
const React = (globalThis as unknown as { React: typeof import("react") }).React;

export const Fragment = React.Fragment;

function toElement(type: any, props: any, key?: any): any {
  const { children, ...rest } = props ?? {};
  const config = key !== undefined ? { ...rest, key } : rest;
  if (children === undefined) return React.createElement(type, config);
  return Array.isArray(children)
    ? React.createElement(type, config, ...children)
    : React.createElement(type, config, children);
}

export const jsx = toElement;
export const jsxs = toElement;
export const jsxDEV = toElement;
