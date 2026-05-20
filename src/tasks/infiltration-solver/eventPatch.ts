// Bitburner's InfiltrationRoot registers a global keydown listener on
// `document` that calls onFailure({automated: true}) — which deals damage
// equal to the player's current HP — if `event.isTrusted` is false OR
// `event instanceof KeyboardEvent` is false. A naive dispatchEvent() will
// therefore instantly hospitalize the player.
//
// Workaround: monkey-patch `document.addEventListener` so when the
// infiltration root registers its listener, we wrap the callback. The
// wrapper replaces flagged synthetic events with a faux object that:
//   1. has KeyboardEvent.prototype on its prototype chain (passes
//      `instanceof KeyboardEvent`)
//   2. defines `isTrusted: true` (passes the isTrusted guard)
// Listeners registered before the patch is installed are untouched — so
// the solver MUST be started before the user clicks Infiltrate Company.

const PATCH_FLAG = "__bbInfilPatched";
const TRUSTED_FLAG = "__bbInfilTrustedKey";

export function installEventPatch(doc: Document): void {
  const d = doc as unknown as Record<string, unknown>;
  if (d[PATCH_FLAG]) return;
  d[PATCH_FLAG] = true;

  const original = doc.addEventListener.bind(doc);
  doc.addEventListener = function patchedAddEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (type !== "keydown" || typeof listener !== "function") {
      return original(
        type,
        listener as EventListenerOrEventListenerObject,
        options as AddEventListenerOptions,
      );
    }
    const wrapped: EventListener = (raw) => {
      const ev = raw as KeyboardEvent & Record<string, unknown>;
      if (ev[TRUSTED_FLAG]) {
        const fake = Object.create(KeyboardEvent.prototype) as KeyboardEvent;
        Object.defineProperty(fake, "isTrusted", { value: true });
        Object.defineProperty(fake, "key", { value: ev.key });
        Object.defineProperty(fake, "code", { value: ev.code ?? "" });
        Object.defineProperty(fake, "type", { value: "keydown" });
        Object.defineProperty(fake, "altKey", { value: false });
        Object.defineProperty(fake, "ctrlKey", { value: false });
        Object.defineProperty(fake, "metaKey", { value: false });
        Object.defineProperty(fake, "shiftKey", { value: false });
        Object.defineProperty(fake, "preventDefault", { value: () => {} });
        Object.defineProperty(fake, "stopPropagation", { value: () => {} });
        return (listener as EventListener)(fake);
      }
      return (listener as EventListener)(raw);
    };
    return original(type, wrapped, options as AddEventListenerOptions);
  } as typeof doc.addEventListener;
}

export function dispatchTrusted(doc: Document, key: string): void {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true });
  (ev as unknown as Record<string, unknown>)[TRUSTED_FLAG] = true;
  doc.dispatchEvent(ev);
}
