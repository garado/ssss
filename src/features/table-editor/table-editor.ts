(() => {
  type Loc = { pos: number; rows: number; cols: number; r: number; c: number };
  type Row = string[] & { src?: string; was?: string };
  type Table = {
    from: number; to: number; indent: string;
    align: string[]; rows: Row[];
    delimSrc: string; alignWas: string; padded: boolean;
  };

  const view = () => window.client && window.client.editorView;
  const notify = (msg: string) => {
    try { window.client!.flashNotification!(msg, "error"); } catch (e) { console.warn(msg); }
  };

  const stop = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
  const len = (s: string) => Array.from(s).length;
  const padTo = (a: any[], n: number) => { while (a.length < n) a.push(""); return a; };
  const swap = (a: any[], i: number, j: number) => {
    padTo(a, Math.max(i, j) + 1);
    const x = a[i]; a[i] = a[j]; a[j] = x;
  };
  const closest = (t: EventTarget | null, sel: string): HTMLElement | null =>
    t instanceof Element ? t.closest(sel) : null;
  const cellAt = (t: EventTarget | null) =>
    closest(t, ".sb-table-widget td, .sb-table-widget th");

  const ROW_RE = /^\s*\|/;
  const DELIM_RE = /^\s*\|?(\s*:?-+:?\s*\|)*\s*:?-+:?\s*\|?\s*$/;
  const DELIM: Record<string, string> = { "": "---", left: ":---", center: ":---:", right: "---:" };

  // ---- markdown <-> model ----------------------------------------------------
  const splitRow = (line: string): string[] => {
    let s = line.trim();
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
    const cells: string[] = [];
    let cur = "";
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "\\" && s[i + 1] === "|") { cur += "\\|"; i++; continue; }
      if (s[i] === "|") { cells.push(cur.trim()); cur = ""; continue; }
      cur += s[i];
    }
    cells.push(cur.trim());
    return cells;
  };

  const alignOf = (c: string) =>
    c.startsWith(":") && c.endsWith(":") ? "center"
      : c.endsWith(":") ? "right"
        : c.startsWith(":") ? "left" : "";

  const emptyRow = (t: Table): Row => t.align.map(() => "");

  /** The table whose first line holds `pos`, parsed downward from the document. */
  const readTable = (pos: number): Table | null => {
    const v = view();
    if (!v || v.state.readOnly) return null;
    const doc = v.state.doc;
    if (pos < 0 || pos > doc.length) return null;

    const lines = [];
    for (let i = doc.lineAt(pos).number; i <= doc.lines; i++) {
      const l = doc.line(i);
      if (!ROW_RE.test(l.text)) break;
      lines.push(l);
    }
    if (lines.length < 2 || !DELIM_RE.test(lines[1].text)) return null;

    const align = splitRow(lines[1].text).map(alignOf);
    const rows: Row[] = [lines[0], ...lines.slice(2)].map((l) => {
      const c: Row = padTo(splitRow(l.text), align.length);
      // remembered so an untouched row is written back byte for byte
      c.src = l.text;
      c.was = c.join("|");
      return c;
    });
    const widths = lines.map((l) => len(l.text));

    return {
      from: lines[0].from,
      to: lines[lines.length - 1].to,
      indent: lines[0].text.match(/^\s*/)![0],
      align,
      rows,
      delimSrc: lines[1].text,
      alignWas: align.join("|"),
      // aligned pipes in the source are kept aligned; compact tables stay compact
      padded: lines.length > 2 && widths.every((w) => w === widths[0]) &&
        lines.some((l) => /\S {2,}\|/.test(l.text)),
    };
  };

  const writeTable = (t: Table) => {
    const w: number[] = [];
    t.rows.forEach((r) => r.forEach((s, c) => { w[c] = Math.max(w[c] || 3, len(s)); }));

    const pad = (s: string, c: number) => {
      const gap = w[c] - len(s), a = t.align[c];
      const left = a === "right" ? gap : a === "center" ? Math.floor(gap / 2) : 0;
      return " ".repeat(left) + s + " ".repeat(gap - left);
    };
    const cell = (s: string, c: number) =>
      t.padded ? " " + pad(s, c) + " " : s === "" ? " " : " " + s + " ";
    const delim = (a: string, c: number) => {
      if (!t.padded) return DELIM[a];
      const d = "-".repeat(w[c] - (a === "center" ? 2 : a ? 1 : 0));
      return " " + (a === "center" || a === "left" ? ":" : "") + d +
        (a === "center" || a === "right" ? ":" : "") + " ";
    };

    // a compact table only rewrites the rows that changed; a padded one re-pads every row
    const line = (r: Row) =>
      !t.padded && r.src != null && r.join("|") === r.was
        ? r.src
        : t.indent + "|" + r.map(cell).join("|") + "|";
    const delimLine = !t.padded && t.align.join("|") === t.alignWas
      ? t.delimSrc
      : t.indent + "|" + t.align.map(delim).join("|") + "|";

    return [line(t.rows[0]), delimLine, ...t.rows.slice(1).map(line)].join("\n");
  };

  const escapeCell = (v: string) => v.replace(/\r?\n/g, " ").trim()
    .replace(/(\\*)\|/g, (m, bs) => bs.length % 2 ? m : bs + "\\|");
  const unescapeCell = (s: string) => s.replace(/\\\|/g, "|");

  // ---- applying edits ---------------------------------------------------------
  let lastChanges: any = null;
  /** Row-wise yank register, shared across cell editors and tables. */
  let yankRows: Row[] | null = null;

  /** Smallest from/to/insert that turns `before` into `after`. */
  const minimalDiff = (before: string, after: string, base: number) => {
    const maxLen = Math.min(before.length, after.length);
    let start = 0;
    while (start < maxLen && before[start] === after[start]) start++;
    let end = 0;
    while (end < maxLen - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
    return { start, end, insert: after.slice(start, after.length - end), base };
  };

  /**
   * SB renders a table as raw markdown while the cursor sits inside its
   * range, so every edit has to leave the cursor outside it or the widget
   * never comes back.
   */
  const parkCursorOutside = (pos: number) => {
    const v = view();
    const t = v && readTable(pos);
    if (!v || !t) return;
    const doc = v.state.doc;
    const endLine = doc.lineAt(t.to);
    const parkPos = endLine.number < doc.lines
      ? doc.line(endLine.number + 1).from
      : t.from > 0 ? t.from - 1 : 0;
    v.dispatch({ selection: { anchor: parkPos } });
  };

  /**
   * Re-read the table at `loc`, let `fn` change the model, write it back as
   * one edit. `fn` returns false to abort; the row count guards against the
   * source having moved on since `loc` was taken.
   */
  const mutate = (loc: Loc, fn: (t: Table) => void | false) => {
    const v = view();
    const t = readTable(loc.pos);
    if (!t || t.rows.length !== loc.rows) {
      notify("Table changed underneath the edit; nothing saved");
      return false;
    }
    if (fn(t) === false) return false;

    const after = writeTable(t);
    const before = v.state.sliceDoc(t.from, t.to);
    if (after === before) return true;

    const { start, end, insert } = minimalDiff(before, after, t.from);
    const from = t.from + start;
    const tr = v.state.update({
      changes: { from, to: t.to - end, insert },
      selection: { anchor: from + insert.length },
      userEvent: "input",
    });
    v.dispatch(tr);
    lastChanges = tr.changes;
    parkCursorOutside(loc.pos);
    return true;
  };

  // ---- DOM <-> source position ------------------------------------------------
  const tablePos = (table: HTMLTableElement | null) => {
    const v = view();
    const w = table && table.closest(".sb-table-widget");
    if (!v || !w || !v.contentDOM.contains(w)) return null;
    try { return v.posAtDOM(w, 0); } catch (e) { return null; }
  };

  const locate = (cell: HTMLElement): Loc | null => {
    const table = cell.closest("table") as HTMLTableElement | null;
    const tr = cell.parentElement as HTMLTableRowElement;
    const pos = tablePos(table);
    if (pos == null || !table) return null;
    const t = readTable(pos);
    if (!t || t.rows.length !== table.rows.length) return null;
    return {
      pos,
      rows: table.rows.length,
      cols: t.align.length,
      r: Array.prototype.indexOf.call(table.rows, tr),
      c: Array.prototype.indexOf.call(tr.cells, cell),
    };
  };

  const findTable = (pos: number): HTMLTableElement | null => {
    const v = view();
    if (!v) return null;
    for (const w of v.contentDOM.querySelectorAll(".sb-table-widget")) {
      let p;
      try { p = v.posAtDOM(w, 0); } catch (e) { continue; }
      const t = w.querySelector("table");
      if (p === pos && t) return t;
    }
    return null;
  };

  /** CodeMirror swaps the widget synchronously but fills the table asynchronously. */
  const whenRendered = (pos: number, rows: number | null, cb: (t: HTMLTableElement) => void) => {
    let tries = 0;
    const tick = () => {
      const t = findTable(pos);
      if (t && (rows == null || t.rows.length === rows)) return cb(t);
      if (++tries < 120) requestAnimationFrame(tick);
    };
    tick();
  };

  // ---- cell editor ------------------------------------------------------------
  let active: { loc: Loc; src: string; ta: HTMLTextAreaElement; cell: HTMLElement; kept: DocumentFragment } | null = null;

  const openAt = (pos: number, r: number, c: number) =>
    whenRendered(pos, null, (table) => {
      const cell = table.rows[r] && table.rows[r].cells[c];
      if (cell) open(cell);
    });

  /** Reopen the cell a command started from, e.g. after it declined to act. */
  const reopen = (loc: Loc) => openAt(loc.pos, loc.r, loc.c);

  /** Commands all save-and-close the open cell first, then work from its Loc. */
  const withCell = (fn: (loc: Loc) => void) => {
    const loc = close(true, true);
    if (loc) fn(loc);
  };

  const focusEditor = () => {
    const v = view();
    if (v) v.focus();
  };

  /** Tracks a pending multi-key sequence: the "g" of "gg", the "d3" of "d3d". */
  const makeSequence = () => {
    let op: string | null = null;
    let digits = "";
    let timer = 0;
    const reset = () => { op = null; digits = ""; clearTimeout(timer); };
    const arm = (ms: number) => { clearTimeout(timer); timer = window.setTimeout(reset, ms); };
    return {
      op: () => op,
      count: () => (digits ? parseInt(digits, 10) : 0),
      begin: (o: string, ms: number) => { op = o; digits = ""; arm(ms); },
      digit: (d: string, ms: number) => { digits += d; arm(ms); },
      reset,
    };
  };
  const SEQ_MS = { g: 600, count: 900 };

  const CTRL_ARROWS: Record<string, [number, number]> = {
    ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
  };

  const SWALLOWED_EVENTS = [
    "mousedown", "mouseup", "click", "dblclick", "keyup", "keypress",
    "beforeinput", "input", "paste", "copy", "cut", "compositionstart", "compositionend",
  ];

  const open = (cell: HTMLElement) => {
    const loc = locate(cell);
    if (!loc) return;
    const src = (readTable(loc.pos)!.rows[loc.r] || [])[loc.c] || "";

    const ta = document.createElement("textarea");
    ta.className = "sb-cell-editor";
    ta.rows = 1;
    ta.spellcheck = true;
    ta.value = unescapeCell(src);

    const kept = document.createDocumentFragment();
    while (cell.firstChild) kept.appendChild(cell.firstChild);
    cell.classList.add("sb-cell-editing");
    cell.appendChild(ta);

    const fit = () => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; };
    active = { loc, src, ta, cell, kept };
    hideHandle();

    // Two modes: normal by default, where hjkl move between cells and the
    // cell has no text caret, and insert, where you type. i enters insert,
    // Esc leaves it. Esc in normal cancels the whole edit.
    let mode = "normal";
    const setMode = (m: string) => {
      mode = m;
      ta.classList.toggle("sb-cell-insert", m === "insert");
    };
    setMode("normal");
    const seq = makeSequence();

    const NORMAL: Record<string, () => void> = {
      Escape: () => close(false),
      Enter: () => close(true),
      i: () => setMode("insert"),
      h: () => stepDirectional(0, -1),
      l: () => stepDirectional(0, 1),
      j: () => stepDirectional(1, 0),
      k: () => stepDirectional(-1, 0),
      G: () => stepToRow(Infinity),
      p: () => pasteRows(false),
      P: () => pasteRows(true),
    };

    for (const ev of SWALLOWED_EVENTS) ta.addEventListener(ev, (e) => e.stopPropagation());
    ta.addEventListener("input", fit);
    ta.addEventListener("blur", () => { if (active && active.ta === ta) close(true, true); });

    ta.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.isComposing) return;

      // Shared bindings, both modes.
      if (e.key === "Tab") { stop(e); step(e.shiftKey ? -1 : 1); return; }
      if (e.ctrlKey && CTRL_ARROWS[e.key]) {
        stop(e);
        stepDirectional(...CTRL_ARROWS[e.key]);
        return;
      }

      if (mode === "insert") {
        if (e.key === "Escape") { stop(e); setMode("normal"); return; }
        if (e.key === "Enter" && !e.shiftKey) {
          // Save and drop back to normal mode on the same cell, rather than
          // exiting the table entirely.
          stop(e);
          const at = close(true, true);
          if (at) reopen(at);
        }
        return; // everything else is ordinary textarea typing
      }

      // Normal mode. Resolve any pending sequence against this key first;
      // any other key cancels it and falls through to the single-key table.
      const op = seq.op();
      const count = seq.count();

      if ((op === "d" || op === "y") && /^[0-9]$/.test(e.key)) {
        stop(e);
        seq.digit(e.key, SEQ_MS.count);
        return;
      }
      seq.reset();

      if (op === "d") {
        if (e.key === "d") { stop(e); deleteRow(count || 1); return; }
        if (e.key === "c") { stop(e); deleteColumn(); return; }
        // "d3" then any other key: treat the count as the row span
        if (count) { stop(e); deleteRow(count); return; }
      }
      if (op === "y") {
        if (e.key === "y" || count) { stop(e); yankRow(count || 1); return; }
      }
      if (op === "g" && e.key === "g") { stop(e); stepToRow(0); return; }

      if (NORMAL[e.key]) { stop(e); NORMAL[e.key](); return; }
      if (e.key === "g") { stop(e); seq.begin("g", SEQ_MS.g); return; }
      if (e.key === "d" || e.key === "y") { stop(e); seq.begin(e.key, SEQ_MS.count); return; }

      // swallow other printable keys so they don't type in normal mode
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault();
    });

    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    fit();
  };

  /** Put the rendered cell back, save if the text changed, return its Loc. */
  const close = (save: boolean, keepFocus?: boolean): Loc | null => {
    const a = active;
    if (!a) return null;
    active = null;

    const value = escapeCell(a.ta.value);
    a.ta.remove();
    a.cell.classList.remove("sb-cell-editing");
    a.cell.appendChild(a.kept);

    if (save && value !== a.src) {
      mutate(a.loc, (t) => {
        if ((t.rows[a.loc.r][a.loc.c] || "") !== a.src) {
          notify("Cell changed underneath the edit; nothing saved");
          return false;
        }
        padTo(t.rows[a.loc.r], a.loc.c + 1);
        t.rows[a.loc.r][a.loc.c] = value;
      });
    }
    if (!keepFocus) focusEditor();
    return a.loc;
  };

  // ---- movement ---------------------------------------------------------------
  /** Tab / Shift+Tab: next or previous cell, wrapping rows, adding one at the end. */
  const step = (dir: number) => withCell((loc) => {
    let r = loc.r, c = loc.c + dir;
    if (c >= loc.cols) { c = 0; r++; }
    if (c < 0) { c = loc.cols - 1; r--; }
    if (r < 0) return focusEditor();
    if (r >= loc.rows) {
      if (!mutate(loc, (t) => { t.rows.push(emptyRow(t)); })) return;
      whenRendered(loc.pos, loc.rows + 1, () => openAt(loc.pos, r, 0));
      return;
    }
    openAt(loc.pos, r, c);
  });

  /** Leave the table, cursor on the line just outside it in the direction travelled. */
  const exitVertically = (loc: Loc, dr: number) => {
    const v = view();
    if (!v) return;
    const t = readTable(loc.pos);
    if (t) {
      const doc = v.state.doc;
      const first = doc.lineAt(t.from).number;
      const last = doc.lineAt(t.to).number;
      const target = dr < 0
        ? (first > 1 ? doc.line(first - 1).from : 0)
        : (last < doc.lines ? doc.line(last + 1).from : doc.length);
      v.dispatch({ selection: { anchor: target } });
    }
    v.focus();
  };

  /** hjkl / Ctrl+Arrow: adjacent cell. Vertical edges exit; horizontal ones hold. */
  const stepDirectional = (dr: number, dc: number) => withCell((loc) => {
    const r = loc.r + dr, c = loc.c + dc;
    if (dr !== 0 && (r < 0 || r >= loc.rows)) return exitVertically(loc, dr);
    const inBounds = r >= 0 && r < loc.rows && c >= 0 && c < loc.cols;
    openAt(loc.pos, inBounds ? r : loc.r, inBounds ? c : loc.c);
  });

  /** gg / G: first or last row, same column. */
  const stepToRow = (target: number) => withCell((loc) =>
    openAt(loc.pos, Math.max(0, Math.min(loc.rows - 1, target)), loc.c));

  // ---- row / column commands ---------------------------------------------------
  /** dd / d<n>: delete rows, cutting them into the register like vim. */
  const deleteRow = (count: number) => withCell((loc) => {
    if (loc.r === 0) { notify("Can't delete the header row"); return reopen(loc); }
    // never take the header, and stop at the end of the table
    const n = Math.max(1, Math.min(count || 1, loc.rows - loc.r));
    const cut: Row[] = [];
    if (!mutate(loc, (t) => { cut.push(...t.rows.splice(loc.r, n).map((r) => r.slice())); })) {
      return reopen(loc);
    }
    yankRows = cut;
    const rows = loc.rows - n;
    whenRendered(loc.pos, rows, () => openAt(loc.pos, Math.min(loc.r, rows - 1), loc.c));
  });

  /** yy / y<n>: copy rows into the register, leaving the table alone. */
  const yankRow = (count: number) => withCell((loc) => {
    const t = readTable(loc.pos);
    if (!t) return reopen(loc);
    const n = Math.max(1, Math.min(count || 1, t.rows.length - loc.r));
    yankRows = t.rows.slice(loc.r, loc.r + n).map((r) => r.slice());
    notify(n === 1 ? "Yanked 1 row" : `Yanked ${n} rows`);
    reopen(loc);
  });

  /** p / P: paste the register below / above the current row. */
  const pasteRows = (above: boolean) => withCell((loc) => {
    if (!yankRows || !yankRows.length) { notify("Nothing to paste"); return reopen(loc); }
    const at = above ? Math.max(1, loc.r) : loc.r + 1; // never above the header
    const pasted = yankRows.map((r) => r.slice());
    const ok = mutate(loc, (t) => {
      // match the table's column count: pad short rows, drop extra cells
      t.rows.splice(at, 0, ...pasted.map((r) => padTo(r.slice(0, t.align.length), t.align.length)));
    });
    if (!ok) return reopen(loc);
    whenRendered(loc.pos, loc.rows + pasted.length, () => openAt(loc.pos, at, loc.c));
  });

  const deleteColumn = () => withCell((loc) => {
    if (loc.cols <= 1) { notify("Can't delete the only column"); return reopen(loc); }
    const ok = mutate(loc, (t) => {
      t.rows.forEach((row) => row.splice(loc.c, 1));
      t.align.splice(loc.c, 1);
    });
    if (!ok) return reopen(loc);
    const cols = loc.cols - 1;
    whenRendered(loc.pos, loc.rows, () => openAt(loc.pos, loc.r, Math.min(loc.c, cols - 1)));
  });

  // ---- entering the editor ------------------------------------------------------
  // Plain click on a cell edits it; Alt/Ctrl/Meta/Shift-click and links keep
  // SilverBullet's own behaviour.
  let swallowClick = false;
  window.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const cell = cellAt(e.target);
    if (!cell || cell.classList.contains("sb-cell-editing")) return;
    if (document.body.classList.contains("sb-col-resize-hover")) return;
    if (closest(e.target, "a, button, input, textarea, select, label, .sb-task-state")) return;
    const loc = locate(cell);
    if (!loc) return;

    stop(e);
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 600);
    closeMenu();

    if (!active) return open(cell);
    // saving the open cell may shift this table, so map its position through that edit
    lastChanges = null;
    close(true, true);
    openAt(lastChanges ? lastChanges.mapPos(loc.pos) : loc.pos, loc.r, loc.c);
  }, true);

  window.addEventListener("click", (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    if (closest(e.target, ".sb-table-widget")) stop(e);
  }, true);

  // Plain j/k/Arrow that would move the cursor onto a table row opens that
  // table's cell editor instead of landing in raw markdown. Hold the "stay
  // raw" modifier to opt out: Alt for j/k (Ctrl+J is Chrome's reserved
  // Downloads shortcut and never reaches page JS), Ctrl for arrows. Capture
  // phase on document so this beats CodeMirror/vim's own key handling.
  document.addEventListener("keydown", (e) => {
    if (active || e.metaKey) return;
    const isJK = e.key === "j" || e.key === "k";
    const isArrow = e.key === "ArrowDown" || e.key === "ArrowUp";
    if (!isJK && !isArrow) return;
    if (isJK ? e.altKey : e.ctrlKey) return;

    const v = view();
    if (!v || !v.hasFocus) return;
    const doc = v.state.doc;
    const dir = (e.key === "j" || e.key === "ArrowDown") ? 1 : -1;
    const targetNo = doc.lineAt(v.state.selection.main.head).number + dir;
    if (targetNo < 1 || targetNo > doc.lines) return;
    if (!ROW_RE.test(doc.line(targetNo).text)) return;

    // readTable parses downward, so entering from below (where the target is
    // the table's *last* row) would parse one line, find no delimiter under
    // it, and bail. Walk up to the table's real first line first.
    let firstNo = targetNo;
    while (firstNo > 1 && ROW_RE.test(doc.line(firstNo - 1).text)) firstNo--;
    const t = readTable(doc.line(firstNo).from);
    if (!t) return;

    stop(e);
    openAt(t.from, dir > 0 ? 0 : t.rows.length - 1, 0);
  }, true);

  // ---- hover handles --------------------------------------------------------------
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>';
  const GRIP = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';

  const mkHandle = (cls: string, title: string, svg: string) => {
    const b = document.createElement("button");
    b.className = "sb-table-handle" + cls;
    b.title = title;
    b.tabIndex = -1;
    b.innerHTML = svg;
    document.body.appendChild(b);
    return b;
  };
  const handle = mkHandle("", "Table row / column actions", ICON);
  const rowGrip = mkHandle(" is-grip", "Drag to move row", GRIP);
  const colGrip = mkHandle(" is-grip is-col", "Drag to move column", GRIP);
  const handles = [handle, rowGrip, colGrip];

  let hoverCell: HTMLElement | null = null;
  let menu: HTMLElement | null = null;
  let drag: { to: number } | null = null;
  let hideTimer = 0;

  const place = (el: HTMLElement, x: number, y: number) => {
    el.style.left = Math.max(0, x) + "px";
    el.style.top = Math.max(0, y) + "px";
    el.classList.add("is-visible");
  };
  const hideHandle = () => {
    handles.forEach((h) => h.classList.remove("is-visible"));
    hoverCell = null;
  };
  const dismiss = () => { hideHandle(); closeMenu(); };
  const cancelHide = () => { clearTimeout(hideTimer); hideTimer = 0; };

  const showHandle = (cell: HTMLElement) => {
    const table = cell.closest("table") as HTMLTableElement;
    const tr = cell.parentElement as HTMLTableRowElement;
    const r = cell.getBoundingClientRect(), tb = table.getBoundingClientRect();
    place(handle, r.right - 21, r.top + Math.max(2, (r.height - 18) / 2));

    // the first row is the header: it has no row grip
    if (tr.rowIndex > 0) {
      const rr = tr.getBoundingClientRect();
      place(rowGrip, tb.left - 21, rr.top + (rr.height - 18) / 2);
    } else rowGrip.classList.remove("is-visible");

    const head = table.rows[0].cells[(cell as HTMLTableCellElement).cellIndex];
    if (head) {
      const h = head.getBoundingClientRect();
      place(colGrip, h.left + (h.width - 18) / 2, h.top - 10);
    } else colGrip.classList.remove("is-visible");

    hoverCell = cell;
  };

  // the grips sit outside the cell, so leaving the table hides them only after a pause
  document.addEventListener("mousemove", (e) => {
    if (menu || active || drag) return;
    if (handles.some((h) => h.contains(e.target as Node))) return cancelHide();
    const cell = cellAt(e.target);
    if (!cell || document.body.classList.contains("sb-col-resizing")) {
      if (hoverCell && !hideTimer) hideTimer = window.setTimeout(() => { hideTimer = 0; hideHandle(); }, 250);
      return;
    }
    cancelHide();
    if (cell !== hoverCell && tablePos(cell.closest("table")) != null) showHandle(cell);
  }, { passive: true });

  window.addEventListener("scroll", () => { if (!drag) dismiss(); }, true);
  // CodeMirror's scroll container doesn't always bubble scroll up to window
  const cmScroller = document.querySelector(".cm-scroller");
  if (cmScroller) cmScroller.addEventListener("scroll", () => { if (!drag) dismiss(); }, true);

  // Unconditional hide on any click outside the table/handles — more reliable
  // than waiting for the mouse to drift off the cell.
  document.addEventListener("mousedown", (e) => {
    if (drag || active) return;
    if (handles.some((h) => h.contains(e.target as Node))) return;
    if (menu && menu.contains(e.target as Node)) return;
    if (closest(e.target, ".sb-table-widget")) return;
    hideHandle();
  }, true);

  // ---- drag to reorder -------------------------------------------------------------
  /** Per-axis geometry, so row and column dragging share one implementation. */
  const AXES = {
    row: {
      items: (t: HTMLTableElement) => Array.from(t.rows) as HTMLElement[],
      first: 1, // the header never moves
      coord: (e: PointerEvent) => e.clientY,
      near: (b: DOMRect) => b.top,
      span: (b: DOMRect) => b.height,
      end: (tb: DOMRect) => tb.bottom,
      carried: (t: HTMLTableElement, i: number) => [t.rows[i] as HTMLElement],
      line: (tb: DOMRect, at: number) =>
        ({ left: tb.left + "px", top: (at - 1) + "px", width: tb.width + "px", height: "2px" }),
    },
    col: {
      items: (t: HTMLTableElement) => Array.from(t.rows[0].cells) as HTMLElement[],
      first: 0,
      coord: (e: PointerEvent) => e.clientX,
      near: (b: DOMRect) => b.left,
      span: (b: DOMRect) => b.width,
      end: (tb: DOMRect) => tb.right,
      carried: (t: HTMLTableElement, i: number) =>
        Array.from(t.rows, (tr) => tr.cells[i] as HTMLElement).filter(Boolean),
      line: (tb: DOMRect, at: number) =>
        ({ left: (at - 1) + "px", top: tb.top + "px", width: "2px", height: tb.height + "px" }),
    },
  };

  const startDrag = (e: PointerEvent, axis: "row" | "col") => {
    if (e.button !== 0 || !hoverCell) return;
    stop(e);
    const ax = AXES[axis];
    const cell = hoverCell;
    const table = cell.closest("table") as HTMLTableElement;
    const loc = locate(cell);
    if (!loc) return;

    const from = axis === "row" ? loc.r : loc.c;
    const carried = ax.carried(table, from);
    carried.forEach((el) => el.classList.add("sb-table-dragged"));

    const line = document.createElement("div");
    line.className = "sb-table-drop";
    document.body.appendChild(line);
    document.body.classList.add("sb-table-dragging");
    drag = { to: from };

    // drag.to is a slot: "before row/column i", or the count for "at the end"
    const move = (ev: PointerEvent) => {
      const tb = table.getBoundingClientRect();
      const items = ax.items(table);
      let to = items.length;
      for (let i = ax.first; i < items.length; i++) {
        const b = items[i].getBoundingClientRect();
        if (ax.coord(ev) < ax.near(b) + ax.span(b) / 2) { to = i; break; }
      }
      drag!.to = to;
      const at = to < items.length ? ax.near(items[to].getBoundingClientRect()) : ax.end(tb);
      Object.assign(line.style, ax.line(tb, at));
    };

    const finish = (commit: boolean) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", esc, true);
      carried.forEach((el) => el.classList.remove("sb-table-dragged"));
      line.remove();
      document.body.classList.remove("sb-table-dragging");

      const to = drag!.to;
      drag = null;
      hideHandle();
      const dest = to > from ? to - 1 : to;
      if (!commit || dest === from) return;

      mutate(loc, (t) => {
        const moveIn = (a: any[]) => {
          padTo(a, from + 1);
          a.splice(dest, 0, a.splice(from, 1)[0]);
        };
        if (axis === "row") moveIn(t.rows);
        else { t.rows.forEach(moveIn); moveIn(t.align); }
      });
    };

    const up = () => finish(true);
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape") { stop(ev); finish(false); } };

    move(e);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", esc, true);
  };

  rowGrip.addEventListener("pointerdown", (e) => startDrag(e, "row"));
  colGrip.addEventListener("pointerdown", (e) => startDrag(e, "col"));
  for (const g of [rowGrip, colGrip]) g.addEventListener("click", stop);

  handle.addEventListener("mousedown", stop);
  handle.addEventListener("click", (e) => {
    stop(e);
    const loc = hoverCell && locate(hoverCell);
    if (!loc) return hideHandle();
    const r = handle.getBoundingClientRect();
    openMenu(loc, r.right, r.bottom + 2);
  });

  // ---- row / column menu ------------------------------------------------------------
  type MenuItem = { label: string; run?: () => void; cls?: string };

  const closeMenu = () => {
    if (!menu) return;
    menu.remove();
    menu = null;
    hideHandle();
  };

  document.addEventListener("mousedown", (e) => {
    if (menu && !menu.contains(e.target as Node)) closeMenu();
  }, true);
  document.addEventListener("keydown", (e) => {
    if (menu && e.key === "Escape") { stop(e); closeMenu(); }
  }, true);

  const menuItems = (loc: Loc): MenuItem[] => {
    const { r, c, rows, cols } = loc;
    const head = r === 0;

    // `then` is the [r, c] of the cell to start editing afterwards
    const act = (fn: (t: Table) => void, nRows?: number, then?: [number, number]) => () => {
      closeMenu();
      if (!mutate(loc, fn)) return;
      if (then) whenRendered(loc.pos, nRows!, () => openAt(loc.pos, then[0], then[1]));
    };
    const insertCol = (at: number): MenuItem["run"] => act((t) => {
      t.rows.forEach((row) => { padTo(row, at); row.splice(at, 0, ""); });
      t.align.splice(at, 0, "");
    }, rows, [0, at]);

    const current = (readTable(loc.pos) || { align: [] as string[] }).align[c] || "";
    const aligns: Record<string, string> = { Default: "", Left: "left", Center: "center", Right: "right" };

    return [
      { label: "Row" },
      !head && { label: "Insert row above", run: act((t) => { t.rows.splice(r, 0, emptyRow(t)); }, rows + 1, [r, c]) },
      { label: "Insert row below", run: act((t) => { t.rows.splice(r + 1, 0, emptyRow(t)); }, rows + 1, [r + 1, c]) },
      r > 1 && { label: "Move row up", run: act((t) => swap(t.rows, r, r - 1)) },
      !head && r < rows - 1 && { label: "Move row down", run: act((t) => swap(t.rows, r, r + 1)) },
      !head && { label: "Delete row", run: act((t) => { t.rows.splice(r, 1); }), cls: "is-danger" },

      { label: "Column" },
      { label: "Insert column left", run: insertCol(c) },
      { label: "Insert column right", run: insertCol(c + 1) },
      c > 0 && { label: "Move column left", run: act((t) => { t.rows.forEach((row) => swap(row, c, c - 1)); swap(t.align, c, c - 1); }) },
      c < cols - 1 && { label: "Move column right", run: act((t) => { t.rows.forEach((row) => swap(row, c, c + 1)); swap(t.align, c, c + 1); }) },
      cols > 1 && { label: "Delete column", run: act((t) => { t.rows.forEach((row) => row.splice(c, 1)); t.align.splice(c, 1); }), cls: "is-danger" },

      { label: "Align column" },
      ...Object.keys(aligns).map((label) => ({
        label,
        run: act((t) => { t.align[c] = aligns[label]; }),
        cls: aligns[label] === current ? "is-current" : "",
      })),
    ].filter(Boolean) as MenuItem[];
  };

  const renderMenu = (items: MenuItem[]) => {
    const el = document.createElement("div");
    el.className = "sb-table-menu";
    el.setAttribute("role", "menu");

    items.forEach((it, i) => {
      if (!it.run) { // section header
        if (i) el.appendChild(document.createElement("hr"));
        const h = document.createElement("div");
        h.className = "sb-table-menu-head";
        h.textContent = it.label;
        el.appendChild(h);
        return;
      }
      const b = document.createElement("button");
      b.setAttribute("role", "menuitem");
      b.textContent = it.label;
      if (it.cls) b.className = it.cls;
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", (e) => { stop(e); it.run!(); });
      el.appendChild(b);
    });
    return el;
  };

  const openMenu = (loc: Loc, x: number, y: number) => {
    closeMenu();
    menu = renderMenu(menuItems(loc));
    document.body.appendChild(menu);

    const m = menu.getBoundingClientRect();
    menu.style.left = Math.max(4, Math.min(x - m.width, innerWidth - m.width - 4)) + "px";
    menu.style.top = (y + m.height > innerHeight - 4 ? Math.max(4, y - m.height - 24) : y) + "px";
    handle.classList.add("is-visible");
  };
})();
