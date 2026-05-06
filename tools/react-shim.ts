// Build-time shim: any `import ... from "react"` in user code resolves here
// (via the alias in vite.config.ts) instead of node_modules. Bitburner exposes
// React on globalThis; we just re-export it so user files look like a normal
// React app (`import React, { useState } from "react"`).
const React = (globalThis as unknown as { React: typeof import("react") }).React;

export default React;

export const {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useContext,
  useReducer,
  useLayoutEffect,
  useDebugValue,
  useImperativeHandle,
  useTransition,
  useDeferredValue,
  useId,
  useSyncExternalStore,
  useInsertionEffect,
  Fragment,
  StrictMode,
  Suspense,
  Profiler,
  memo,
  forwardRef,
  lazy,
  createContext,
  createElement,
  cloneElement,
  isValidElement,
  Children,
  startTransition,
  version,
} = React;
