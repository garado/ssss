(() => {
  // src/features/vim-clipboard/vim-clipboard.ts
  (() => {
    const cmOf = () => {
      const v = window.client && window.client.editorView;
      return v && v.cm || null;
    };
    const fallbackCopy = (text) => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;top:-100px;opacity:0";
      document.body.appendChild(ta);
      const active = document.activeElement;
      try {
        ta.select();
        document.execCommand("copy");
      } catch (e) {
        console.warn("ssss: clipboard write failed", e);
      }
      ta.remove();
      if (active) active.focus();
    };
    const toClipboard = (text) => {
      try {
        const p = navigator.clipboard && navigator.clipboard.writeText(text);
        if (p) return p.catch(() => fallbackCopy(text));
      } catch (e) {
      }
      fallbackCopy(text);
    };
    const isLinewise = (cm) => {
      const vim = cm.state.vim;
      if (vim && vim.visualLine) return true;
      try {
        const s = cm.getCursor("start"), e = cm.getCursor("end");
        return s.ch === 0 && e.ch === 0 && e.line > s.line;
      } catch (e) {
        return false;
      }
    };
    const completesYank = (cm, e) => {
      const vim = cm.state.vim;
      if (!vim || vim.insertMode) return false;
      if (e.ctrlKey || e.altKey || e.metaKey) return false;
      if ((vim.inputState && vim.inputState.operator) === "yank") {
        return e.key !== "Escape" && !/^["0-9]$/.test(e.key);
      }
      return vim.visualMode ? e.key === "y" || e.key === "Y" : e.key === "Y";
    };
    let armed = false;
    const attach = (cm) => {
      if (cm.__ssssClipboard) return;
      cm.__ssssClipboard = true;
      const read = cm.getSelection.bind(cm);
      cm.getSelection = () => {
        const text = read();
        if (armed) {
          armed = false;
          if (text) toClipboard(isLinewise(cm) ? text.replace(/\n?$/, "\n") : text);
        }
        return text;
      };
    };
    document.addEventListener("keydown", (e) => {
      const cm = cmOf();
      if (!cm || !cm.state.vim) return;
      attach(cm);
      if (!completesYank(cm, e)) return;
      armed = true;
      setTimeout(() => {
        armed = false;
      }, 0);
    }, true);
  })();
})();
