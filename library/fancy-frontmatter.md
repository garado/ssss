---
name: Library/garado/fancy-frontmatter/PLUG
tags: meta/library
---

Replaces the raw frontmatter YAML with a styled table.
- Tags link to `[[Tags/name]]`
- Status field links to the corresponding `#tag` page.

```space-style
.sb-mentions-header {
  font-size: 0.75em;
  font-weight: 600;
  color: var(--subtle-color);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 1.5rem 0 0.5rem 0;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--top-border-color);
}

.sb-mentions-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.sb-mentions-list li {
  padding: 0.2rem 0;
  font-size: 0.875em;
}

.sb-fm-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  margin-bottom: 0.7rem;
  background-color: none;
  border: 1px solid var(--root-color);
}

.sb-fm-key {
  text-align: right;
  padding: 5px 14px 5px 10px;
  color: var(--root-color);
  font-weight: 600;
  font-size: 0.875em;
  white-space: nowrap;
  width: 7em;
  background-color: none;
}

.sb-fm-value {
  padding: 5px 14px 5px 10px;
  font-size: 0.875em;
  overflow-wrap: anywhere;
}

.sb-fm-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3em;
}

.sb-fm-link {
  color: var(--link-color);
  text-decoration: underline;
  cursor: pointer;
}

.sb-fm-status {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3em;
}

.sb-fm-status-option {
  border: 1px solid var(--top-border-color);
  border-radius: 4px;
  padding: 0.05em 0.6em;
  color: var(--subtle-color);
  text-decoration: none;
  cursor: pointer;
  font-size: 0.875em;
}

.sb-fm-status-option:hover {
  border-color: var(--ui-accent-color);
  color: var(--root-color);
}

.sb-fm-status-active {
  border: 1px solid var(--ui-accent-color);
  background-color: color-mix(in srgb, var(--ui-accent-color) 18%, transparent);
  color: var(--root-color);
  font-weight: 600;
}

.sb-fm-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  border: 1px solid var(--ui-accent-color);
  background-color: color-mix(in srgb, var(--ui-accent-color) 18%, transparent);
  border-radius: 4px;
  padding: 0.05em 0.5em;
}

.sb-fm-tag .sb-fm-link {
  text-decoration: none;
}

.sb-fm-tag-remove {
  color: var(--meta-subtle-color);
  cursor: pointer;
  line-height: 1;
  text-decoration: none;
}

.sb-fm-tag-remove:hover {
  color: var(--link-color);
}

.sb-fm-tag-add {
  color: var(--meta-subtle-color);
  cursor: pointer;
  text-decoration: none;
  font-size: 0.9em;
  padding-left: 0.5em;
}

.sb-fm-tag-add:hover {
  color: var(--link-color);
}

/* Hide raw frontmatter YAML in the editor */
.sb-frontmatter {
  display: none !important;
}
```

```space-lua
-- Ported from the old hooks:renderTopWidgets/renderBottomWidgets event
-- listeners (deprecated in SB 2.12) to view.define with dock="page-top"/
-- "page-bottom" and frame="minimal" instead. frame="minimal" renders as
-- plain page content with hover-only chrome, so this no longer needs the
-- manual button-bar/border CSS overrides the old version carried to fight
-- the widget frame.

local function enabled()
  local cfg = config.get("ssss", {})
  local features = cfg.features
  if type(features) ~= "table" then return true end
  return features.metadataPrettify ~= false
end

local FM_SKIP = { name = true, pageDecoration = true, range = true }

local STATUS_VALUES = { "none", "stub", "start", "solid" }

-- Preferred display order for known keys; others follow sorted alphabetically.
local FM_ORDER = { "created", "modified", "tags", "status" }

-- Normalize a tags value to a plain array of strings (strips leading #).
local function normalizeTags(value)
  local result = {}

  local function addTag(s)
    s = s:gsub("^#", "")
    if s ~= "" then table.insert(result, s) end
  end

  if type(value) == "table" then
    for _, tag in pairs(value) do
      local s = tostring(tag):gsub("[“‘”’\"',]", "")
      addTag(s)
    end
  else
    -- String or any other type: convert and split on whitespace/commas
    local s = tostring(value):gsub("[\"']", ""):gsub(",", " ")
    for word in s:gmatch("%S+") do addTag(word) end
  end

  return result
end

-- Build a <td> element for the given frontmatter key/value.
local function buildValueCell(key, value)
  local td = dom.td { class = "sb-fm-value" }

  if key == "tags" then
    local tags = normalizeTags(value)

    local function currentTags()
      local extracted = index.extractFrontmatter(editor.getText())
      local fm = extracted and extracted.frontmatter or {}
      return normalizeTags(fm.tags)
    end

    local function saveTags(newTags)
      local ops = { { op = "delete-key", path = "tags" } }
      if #newTags > 0 then
        table.insert(ops, { op = "set-key", path = "tags", value = newTags })
      end
      local patched = index.patchFrontmatter(editor.getText(), ops)
      editor.setText(patched)
      codeWidget.refreshAll()
    end

    local tagsWrap = dom.div { class = "sb-fm-tags" }

    for _, tag in ipairs(tags) do
      local t = tag
      local chip = dom.span { class = "sb-fm-tag" }
      chip.appendChild(dom.a {
        class = "sb-fm-link",
        onclick = function() editor.navigate("Tags/" .. t) end,
        t
      })
      chip.appendChild(dom.a {
        class = "sb-fm-tag-remove",
        title = "Remove tag",
        onclick = function()
          local newTags = {}
          for _, other in ipairs(currentTags()) do
            if other ~= t then table.insert(newTags, other) end
          end
          saveTags(newTags)
        end,
        "×"
      })
      tagsWrap.appendChild(chip)
    end

    tagsWrap.appendChild(dom.a {
      class = "sb-fm-tag-add",
      onclick = function()
        local newTag = editor.prompt("Add tag")
        if not newTag or newTag == "" then return end
        newTag = newTag:gsub("^#", "")
        local newTags = currentTags()
        if table.includes(newTags, newTag) then return end
        table.insert(newTags, newTag)
        saveTags(newTags)
      end,
      "add tag"
    })

    td.appendChild(tagsWrap)

  elseif key == "status" then
    local status = tostring(value)
    local statusWrap = dom.div { class = "sb-fm-status" }

    for _, s in ipairs(STATUS_VALUES) do
      local sVal = s
      local classes = "sb-fm-status-option"
      if sVal == status then classes = classes .. " sb-fm-status-active" end
      statusWrap.appendChild(dom.a {
        class = classes,
        onclick = function()
          if sVal == status then return end
          local ops = { { op = "delete-key", path = "status" } }
          if sVal ~= "none" then
            table.insert(ops, { op = "set-key", path = "status", value = sVal })
          end
          local patched = index.patchFrontmatter(editor.getText(), ops)
          editor.setText(patched)
          codeWidget.refreshAll()
        end,
        sVal
      })
    end

    td.appendChild(statusWrap)

  elseif type(value) == "boolean" then
    local newValue = not value
    td.appendChild(dom.a {
      class = "sb-fm-link",
      onclick = function()
        local patched = index.patchFrontmatter(editor.getText(), {
          { op = "set-key", path = key, value = newValue },
        })
        editor.setText(patched)
        codeWidget.refreshAll()
      end,
      value and "true" or "false"
    })

  else
    local display
    if type(value) == "table" then
      display = table.concat(value, ", ")
    else
      display = tostring(value)
    end
    td.appendChild(dom.span { display })
  end

  return td
end

view.define {
  name = "ssss.metadataPrettify.frontmatterTable",
  dock = "page-top",
  frame = "minimal",
  content = function()
    if not enabled() then return nil end

    local pageText = editor.getText()
    local extracted = index.extractFrontmatter(pageText)
    local fm = extracted.frontmatter

    if not fm then return end

    -- If created not in frontmatter, pull it from file metadata
    if fm["created"] == nil then
      local meta = editor.getCurrentPageMeta()
      if meta and meta.created then
        local date, time = meta.created:match("(%d%d%d%d%-%d%d%-%d%d)T(%d%d:%d%d)")
        if date and time then
          fm["created"] = date .. " " .. time
        else
          fm["created"] = meta.created
        end
      end
    end

    -- If modified not in frontmatter, pull it from file metadata
    if fm["modified"] == nil then
      local meta = editor.getCurrentPageMeta()
      if meta and meta.lastModified then
        local date, time = meta.lastModified:match("(%d%d%d%d%-%d%d%-%d%d)T(%d%d:%d%d)")
        if date and time then
          fm["modified"] = date .. " " .. time
        else
          fm["modified"] = meta.lastModified
        end
      end
    end

    -- keeps "add tag" always visible, even if none set in fm
    if fm["tags"] == nil then fm["tags"] = {} end

    -- keeps status picker always visible, even if no status is set in fm
    if fm["status"] == nil then fm["status"] = "none" end

    -- Build ordered key list
    local seen = {}
    local orderedKeys = {}

    for _, k in ipairs(FM_ORDER) do
      if fm[k] ~= nil then
        table.insert(orderedKeys, k)
        seen[k] = true
      end
    end

    local rest = {}
    for k in pairs(fm) do
      if not seen[k] and not FM_SKIP[k] then
        table.insert(rest, k)
      end
    end
    table.sort(rest)
    for _, k in ipairs(rest) do
      table.insert(orderedKeys, k)
    end

    -- Assemble table
    local tbody = dom.tbody {}
    for _, key in ipairs(orderedKeys) do
      local row = dom.tr {}
      row.appendChild(dom.th { class = "sb-fm-key", key })
      row.appendChild(buildValueCell(key, fm[key]))
      tbody.appendChild(row)
    end

    return widget.new {
      html = dom.table { class = "sb-fm-table", tbody },
    }
  end,
}

view.define {
  name = "ssss.metadataPrettify.linkedMentions",
  dock = "page-bottom",
  frame = "minimal",
  content = function()
    if not enabled() then return nil end

    local meta = editor.getCurrentPageMeta()
    if not meta or not meta.name then return end

    local pageName = meta.name
    if not pageName:match("^Tags/") then return end

    local tagName = pageName:gsub("^Tags/", "")

    local allPages = index.queryLuaObjects("page", {})
    local tagged = {}
    for _, p in ipairs(allPages) do
      if p.tags and table.includes(p.tags, tagName) then
        table.insert(tagged, p.name)
      end
    end
    table.sort(tagged)

    if not tagged or #tagged == 0 then return end

    local container = dom.div {}

    local heading = dom.div { class = "sb-mentions-header", "Linked mentions" }
    container.appendChild(heading)

    local ul = dom.ul { class = "sb-mentions-list" }
    for _, name in ipairs(tagged) do
      local n = name
      local li = dom.li {}
      li.appendChild(dom.a {
        class = "sb-fm-link",
        onclick = function() editor.navigate(n) end,
        n
      })
      ul.appendChild(li)
    end
    container.appendChild(ul)

    return widget.new {
      html = container,
    }
  end,
}
```
