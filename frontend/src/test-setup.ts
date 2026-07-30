// jsdom is missing several browser APIs that Radix primitives call during
// render. Without these the components throw mid-render and React tears the
// tree down, which surfaces as an empty document rather than a readable error.

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (!globalThis.DOMRect) {
  globalThis.DOMRect = class {
    constructor(
      public x = 0,
      public y = 0,
      public width = 0,
      public height = 0,
    ) {}
    top = 0;
    left = 0;
    right = 0;
    bottom = 0;
    toJSON() {
      return this;
    }
    static fromRect(r?: DOMRectInit) {
      return new DOMRect(r?.x, r?.y, r?.width, r?.height);
    }
  } as unknown as typeof DOMRect;
}

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// jsdom has no PointerEvent, so fireEvent.pointerDown produces a bare Event
// with no `button`/`pointerType` — and Radix's trigger, which opens only for
// `button === 0`, never fires. Everything that opens a menu depends on this.
if (!globalThis.PointerEvent) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId = 1;
    pointerType = "mouse";
    isPrimary = true;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      if (params.pointerId != null) this.pointerId = params.pointerId;
      if (params.pointerType) this.pointerType = params.pointerType;
    }
  }
  globalThis.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}

// Radix Select asks the trigger about pointer capture and scrolls the active
// item into view; jsdom implements neither.
Element.prototype.scrollIntoView ??= function () {};
Element.prototype.hasPointerCapture ??= function () {
  return false;
};
Element.prototype.setPointerCapture ??= function () {};
Element.prototype.releasePointerCapture ??= function () {};
