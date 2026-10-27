---
publish: false
---

Declares the ssss feature flags so they show up in the Configuration tab of
Library: Manager.

```space-lua
config.defineCategory {
  name = "ssss",
  description = "Super Special Silverbullet Setup - https://github.com/garado/ssss",
  priority = 10,
}

local function feature(key, label, description, default)
  config.define("ssss.features." .. key, {
    type = "boolean",
    default = default or false,
    description = description,
    ui = { category = "ssss", label = label },
  })
end

feature("theme", "Theme switcher", "Opinionated theming and theme switching commands")
feature("tableEditor", "Table editor", "Improved editing, resizing, and reordering for markdown tables")
feature("metadataPrettify", "Fancy frontmatter", "Opinionated frontmatter rendering")
feature("vimClipboard", "Vim clipboard yank", "Yank to system clipboard in Vim mode", true)
```
