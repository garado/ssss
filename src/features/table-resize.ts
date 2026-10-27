(() => {
  type Widths = Record<string, number[]>;
  type Edge = { t: HTMLTableElement; i: number };

  const KEY = "sb-table-widths";
  const EDGE = 6;  // px from a cell border that counts as a grab
  const MIN = 40;  // px a column may not shrink below

  const stop = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
  const closest = (t: EventTarget | null, sel: string): HTMLElement | null =>
    t instanceof Element ? t.closest(sel) : null;

  let saved: Widths = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "") || {}; } catch (e) { /* no saved widths */ }
  const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) { /* storage full or blocked */ }
  };

  const headCells = (t: HTMLTableElement) =>
    t.rows.length ? (Array.from(t.rows[0].cells) as HTMLElement[]) : [];

  /** Widths are keyed per page + header row, so they follow a table around. */
  const keyOf = (t: HTMLTableElement) =>
    decodeURIComponent(location.pathname) + "|" +
    headCells(t).map((c) => (c.textContent || "").trim()).join("|");

  const apply = (t: HTMLTableElement, pcts: number[]) => {
    t.style.tableLayout = "fixed";
    headCells(t).forEach((c, i) => { c.style.width = pcts[i] + "%"; });
  };
  const reset = (t: HTMLTableElement) => {
    t.style.tableLayout = "";
    headCells(t).forEach((c) => { c.style.width = ""; });
  };
  const restore = () => {
    document.querySelectorAll<HTMLTableElement>(".sb-table-widget table").forEach((t) => {
      const p = saved[keyOf(t)];
      if (p && p.length === headCells(t).length) apply(t, p);
    });
  };

  /** The border between header cells i and i+1, when the pointer is on it. */
  const edgeAt = (e: MouseEvent): Edge | null => {
    const cell = closest(e.target, ".sb-table-widget th, .sb-table-widget td");
    if (!cell) return null;
    const t = cell.closest("table") as HTMLTableElement | null;
    if (!t || cell.parentElement !== t.rows[0]) return null;

    const cells = headCells(t);
    const idx = cells.indexOf(cell);
    const r = cell.getBoundingClientRect();
    if (r.right - e.clientX <= EDGE && idx < cells.length - 1) return { t, i: idx };
    if (e.clientX - r.left <= EDGE && idx > 0) return { t, i: idx - 1 };
    return null;
  };

  let dragging = false;
  let swallowClick = false;

  document.addEventListener("mousemove", (e) => {
    if (!dragging) document.body.classList.toggle("sb-col-resize-hover", !!edgeAt(e));
  }, { passive: true });

  // Keep CodeMirror from moving the cursor into the table source
  const block = (e: MouseEvent) => {
    if (dragging || swallowClick || edgeAt(e)) stop(e);
  };
  document.addEventListener("mousedown", block, true);
  document.addEventListener("click", block, true);

  document.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const hit = edgeAt(e);
    if (!hit) return;
    stop(e);

    const { t, i } = hit;
    const total = t.getBoundingClientRect().width;
    const px = headCells(t).map((c) => c.getBoundingClientRect().width);
    const pct = () => px.map((w) => +(w / total * 100).toFixed(2));
    const x0 = e.clientX, a = px[i], b = px[i + 1];

    apply(t, pct());
    dragging = true;
    document.body.classList.add("sb-col-resizing");

    // The pair either side of the border trade width; the rest stay put.
    const move = (ev: PointerEvent) => {
      const d = Math.max(MIN - a, Math.min(b - MIN, ev.clientX - x0));
      px[i] = a + d;
      px[i + 1] = b - d;
      apply(t, pct());
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      dragging = false;
      document.body.classList.remove("sb-col-resizing");
      saved[keyOf(t)] = pct();
      persist();
      // the click that ends the drag must not reach CodeMirror
      swallowClick = true;
      setTimeout(() => { swallowClick = false; }, 0);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }, true);

  // Double-click a border to forget this table's saved widths
  document.addEventListener("dblclick", (e) => {
    const hit = edgeAt(e);
    if (!hit) return;
    stop(e);
    delete saved[keyOf(hit.t)];
    persist();
    reset(hit.t);
  }, true);

  // CodeMirror rebuilds table widgets on edit/scroll; re-apply saved widths
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; restore(); });
  }).observe(document.body, { childList: true, subtree: true });

  restore();
})();
