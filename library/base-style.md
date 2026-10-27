---
publish: false
---

ssss's base styles override

```space-style
@font-face {
  font-family: "Ioskeley Mono";
  src: url('https://ahatem.github.io/IoskeleyMono/fonts/IoskeleyMono-Regular.woff2') format('woff2');
  font-weight: normal;
  font-style: normal;
}

html {
  --ui-font: "Ioskeley Mono" !important;
  --editor-font: "Ioskeley Mono" !important;
  --monospace-font: "Ioskeley Mono" !important;
}

html {
  --editor-width: 1000px !important;
  line-height: 1.5 !important;
}

/* idk  */
.sb-lua-wrapper * {
  border: none !important;
}

/* Top bar --------------------------------- */
#sb-top {
  background-color: var(--root-background-color) !important;
  border: none !important;
  margin-top: 1rem !important;
}

#sb-top .main .inner {
  font-size: 1.4rem !important;
}

/* Input ----------------------------------- */
input, .sb-checkbox {
  border-radius: 0 !important;
  accent-color: var(--root-color) !important;
}

/* Blockquote ------------------------------ */
.sb-blockquote-outside .cm-list-bullet {
  margin-right: 0 !important;
}

.sb-line-blockquote {
  padding-left: 2ch !important;
}

/* Admonitions ----------------------------- */

.sb-admonition[admonition="note" i] { --admonition-accent: var(--blue-color); }
.sb-admonition[admonition="warning" i] { --admonition-accent: var(--yellow-color); }
.sb-admonition[admonition="danger" i] { --admonition-accent: var(--red-color); }
.sb-admonition[admonition="success" i] { --admonition-accent: var(--green-color); }

.sb-admonition {
  --admonition-accent: var(--ui-accent-color);
  color: var(--root-color);
  border: none !important;
  border-radius: 0 !important;
  margin: 0 !important;
  padding: 0.2em 2ch !important;
  background-color: color-mix(in srgb, var(--admonition-accent) 15%, transparent) !important;
  box-shadow:
    inset 1px 0 0 var(--admonition-accent),
    inset -1px 0 0 var(--admonition-accent) !important;
}

.sb-admonition-title {
  font-weight: bold;
}

.sb-admonition:not(.sb-admonition + .sb-admonition) {
  box-shadow:
    inset 1px 0 0 var(--admonition-accent),
    inset -1px 0 0 var(--admonition-accent),
    inset 0 1px 0 var(--admonition-accent) !important;
}

.sb-admonition:not(:has(+ .sb-admonition)) {
  box-shadow:
    inset 1px 0 0 var(--admonition-accent),
    inset -1px 0 0 var(--admonition-accent),
    inset 0 -1px 0 var(--admonition-accent) !important;
}

.sb-admonition:not(.sb-admonition + .sb-admonition):not(:has(+ .sb-admonition)) {
  box-shadow:
    inset 1px 0 0 var(--admonition-accent),
    inset -1px 0 0 var(--admonition-accent),
    inset 0 1px 0 var(--admonition-accent),
    inset 0 -1px 0 var(--admonition-accent) !important;
}

.sb-admonition-type {
  font-weight: 700 !important;
}

/* Links ----------------------------------- */
.sb-wiki-link, .wiki-link {
  background-color: none !important;
  border-bottom: 1px solid var(--link-color) !important;
  border-radius: 0 !important;
  padding-left: 0.1rem !important;
  padding-right: 0.1rem !important;
}

/* Code ------------------------------- */
.sb-code {
  font-size: 16px !important;
}

/* Help text ------------------------------- */
.sb-help-text,
.sb-help-text * {
  font-family: ui-sans-serif, sans-serif !important;
  font-size: 12px !important;
}

/* Main editor ----------------------------- */
#sb-main .cm-editor {
  margin-top: 1rem;
}

/* Tables ---------------------------------- */
table {
  border-collapse: collapse;
}

th, td {
  border: 1px dashed var(--subtle-color);
}

tbody td {
  background-color: var(--root-background-color) !important;
}

thead tr {
  background-color: var(--subtle-background-color) !important;
}

/* Unsorted -------------------------------- */

#cfg-root {
  border: 1px solid var(--root-color) !important;
  border-radius: 0px !important;
}

.sb-modal-box {
  box-shadow: rgba(0, 0, 0, 0.1) 0px 2px 12px;
  padding: 4px !important;
  border: 1px solid var(--top-border-color);
}

.cm-searchMatch {
  background-color: var(--highlight-color) !important;
}

.cm-textfield, .cm-button {
  font-size: inherit !important;
}

.sb-strong {
  font-weight: 600 !important;
}

.cm-scroller {
  line-height: 1.7 !important;
}

.sb-line-fenced-code {
  padding-left: 1rem !important;
  padding-right: 1rem !important;
}

.sb-line-fenced-code, .sb-code {
  font-family: var(--monospace-font), monospace !important;
}

button {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

/* fix safari scroll bars in Open and Run Command */
.sb-modal-box .cm-scroller > .cm-content > .cm-line {
  display: unset;
  line-height: 1.9 !important;
}
```
