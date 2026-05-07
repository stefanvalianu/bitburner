// See react-shim.ts. Same idea for ReactDOM.
const ReactDOM = (globalThis as unknown as { ReactDOM: typeof import("react-dom") }).ReactDOM;

export default ReactDOM;

export const { createPortal, flushSync, findDOMNode, render, unmountComponentAtNode } = ReactDOM;
