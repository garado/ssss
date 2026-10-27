---
publish: false
---

This makes vim mode's `y` copy to the system clipboard as well as to vim's own register.

Set `ssss.features.vimClipboard` to false to turn the feature off.

```space-lua
-- inject the built asset into the real page

local ASSETS = "/.fs/Library/garado/ssss/assets/"

local features = config.get("ssss", {}).features
if type(features) ~= "table" or features.vimClipboard ~= false then
  local doc = js.window.document
  if not doc.getElementById("sb-vim-clipboard") then
    local el = doc.createElement("script")
    el.id = "sb-vim-clipboard"
    el.src = ASSETS .. "vim-clipboard.js"
    doc.head.appendChild(el)
  end
end
```
