---
publish: false
---

Adapted from a SilverBullet community thread:
https://community.silverbullet.md/t/table-formatting-gui-editing-drag-resize-etc/4437

This page makes native markdown tables resizable and editable in place. You
can click a cell to edit it. You can also insert, move, and delete rows and
columns from a hover menu or by dragging.

The script source is in `src/features/table-editor/`. The command `npm run
build` bundles both scripts to `assets/table-editor/` with esbuild. The styles
are in `assets/table-editor/table-editor.css`. The space-lua
block at the end of this page injects all three into the page. SilverBullet
serves space files from `/.fs/`.

The scripts cannot run inside the compiled plug. A plug runs in a sandboxed
worker, which is a thread with no access to the page. These scripts need the
real page, because they drive `window.client.editorView`. That object is the
live CodeMirror editor, and the scripts send edits to it directly. Space-lua
is the only part of SilverBullet that can reach the page, so it loads them.

Set `ssss.features.tableEditor` to true to turn the feature on. The flag
covers the styles as well as the scripts. The styles therefore load from a
file, not from a `space-style` block. A `space-style` block always applies,
and no flag can stop it.

# Resizable columns
* Drag the border of a header cell to resize the two columns beside it.
* Double-click a header border to reset the table.
* The browser stores the widths in localStorage, per page and per header row.

# Inline editing
* Click a cell to edit its markdown in place. Enter saves the cell, and so does a click outside it.
* The editor opens in normal mode. The active cell takes an accent border and a light accent fill.
* In normal mode, hjkl move to the next cell. gg and G jump to the first and last row of the column.
* In normal mode, `dd` deletes the current row, and `d<n>` deletes n rows. Both put the rows in the register.
* In normal mode, dc deletes the column. You cannot delete the header row or the last column.
* In normal mode, `yy` and `y<n>` copy rows to the register. p pastes below the current row, and P pastes above it.
* A paste never goes above the header row. ssss pads or trims pasted rows to the column count of the table.
* Press i for insert mode, which deepens the fill. Press Esc to return to normal mode.
* Press Esc in normal mode to cancel the edit.
* Tab and Shift+Tab save the cell and move to the next or previous one. Tab on the last cell adds a row.
* Ctrl and an arrow key save the cell and move one cell that way. The cursor does not wrap.
* Alt+click and Ctrl+click still open the table source. Links and checkboxes in cells work as before.
* Plain j, k, up arrow, or down arrow onto a table row opens the cell editor.
* To land in the raw markdown instead, use Alt+j or Alt+k. Ctrl+J is a reserved Chrome shortcut.
* For the arrow keys, hold Ctrl to land in the raw markdown.
* This check runs on every keypress. To stay in the raw markdown, hold the modifier for each row.
* Hover a cell and use the ⋮ handle to insert, move, and delete rows and columns. The handle also sets column alignment.
* Drag the grip at the left of a row, or above a column header, to reorder. Press Esc to cancel the drag.
* Every change is one ordinary edit, so Ctrl+Z undoes it.
* A table with aligned pipes stays aligned. A compact table stays compact.
* Only tables written in the page are editable. ssss leaves query output and Lua output alone.

```space-lua
-- Lua does one job here: inject the built assets into the real page. They
-- cannot live in the plug, because its worker has no DOM, and SilverBullet
-- v2 does not run `space-script`. This is the only path left.
--
-- The CSS loads the same way, rather than from a `space-style` block on
-- this page, so that the feature flag turns off the whole feature. A
-- `space-style` block always applies and cannot be gated.
local ASSETS = "/.fs/Library/garado/ssss/assets/table-editor/"

local function inject(id, build)
  local doc = js.window.document
  if doc.getElementById(id) then return end
  local el = build(doc)
  el.id = id
  doc.head.appendChild(el)
end

local function loadScript(id, file)
  inject(id, function(doc)
    local el = doc.createElement("script")
    el.src = ASSETS .. file
    return el
  end)
end

local function loadStyle(id, file)
  inject(id, function(doc)
    local el = doc.createElement("link")
    el.rel = "stylesheet"
    el.href = ASSETS .. file
    return el
  end)
end

local features = config.get("ssss", {}).features
if type(features) == "table" and features.tableEditor == true then
  loadStyle("sb-table-style", "table-editor.css")
  loadScript("sb-table-resize", "table-resize.js")
  loadScript("sb-table-edit", "table-editor.js")
end
```
