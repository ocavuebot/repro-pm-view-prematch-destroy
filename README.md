# prosemirror-view 1.42.9 `preMatch` crash, minimal repro

Plain ProseMirror + Vite. No React, no ProseKit, no meowdown.

```bash
pnpm install --ignore-workspace
pnpm dev
```

Open the page and press "Run all" in each section. Every step prints to the page and to the console.

- **A. A node view `destroy()` that throws once.** Deleting a marked run runs `ViewTreeUpdater.destroyBetween`, which destroys children first and splices after. The throw skips the splice, so the destroyed `strong` mark desc (`parent === undefined`) stays in the paragraph's `children`. Undo restores the same node objects, so the next `preMatch` walks into that desc and up to its missing parent: `TypeError ... 'children'`.
- **B. A redraw whose rebuild throws.** Changing `nodeViews` makes `updateStateInner` call `docView.destroy()` and rebuild with `docViewDesc()`. A mark view constructor that throws leaves `view.docView` pointing at the destroyed tree. `view.destroy()` then crashes inside `preMatch` with the same stack as the production event, without any edit in between: `findNodeMatch` rejects every pre-matched child because `targetDesc.parent == this.top` is false, so every block is re-walked.

Verified in headless Chromium (Playwright 1.64) on 2026-11-07 with prosemirror-view 1.42.9, the latest release at that date. 1.42.8 behaves the same. Both scenarios also print that, after the first exception, a DOM edit no longer reaches `view.state`: `updateStateInner` called `domObserver.stop()` and never reached `start()`.
