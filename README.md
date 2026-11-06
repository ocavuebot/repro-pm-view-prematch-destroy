# prosemirror-view: destroyed view descs stay in the tree, `preMatch` then throws

Two ways to end up with a `ViewDesc` whose `parent` is `undefined` (set by `ViewDesc.destroy()`) still sitting in its parent's `children`. The next update that walks into it throws in `preMatch`:

```
TypeError: Cannot read properties of undefined (reading 'children')
    at preMatch            descI = curDesc.parent.children.indexOf(curDesc)
    at new ViewTreeUpdater
    at NodeViewDesc.updateChildren
```

prosemirror-view 1.42.9.

```
pnpm install
pnpm dev
```

**A. A node view `destroy()` throws.** `ViewTreeUpdater.destroyBetween` destroys the children first and splices them out after the loop. If one `destroy()` throws, the descs destroyed before it stay in `children`. In the repro a mark wraps the throwing node view, so the destroyed `MarkViewDesc` stays in the paragraph. Undo restores the same node objects; `preMatch` matches the mark's children and then reads `curDesc.parent.children`.

**B. A redraw fails.** When `nodeViews` change, `updateStateInner` calls `this.docView.destroy()` and then `docViewDesc(...)`. If building the new tree throws (here: a mark view constructor), `view.docView` keeps pointing at the destroyed tree. `findNodeMatch` now rejects every pre-matched child (`targetDesc.parent == this.top` is false), so `view.destroy()` re-walks every block and throws in the first textblock that has a mark.

Possible fixes: splice before destroy (or `try/finally`) in `destroyBetween`; do not leave `this.docView` on a destroyed tree when `docViewDesc` throws; wrap the `docView.update` in `EditorView.destroy` in `try/finally` so the view is still torn down.
