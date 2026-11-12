/**
 * zcode-claude-style · renderer runtime.
 *
 * Injected into the ZCode renderer over CDP. Everything lives under
 * `window.__zcs` so a second injection updates in place instead of stacking:
 *
 *   - `#zcs-fonts`  @font-face block (Inter / Noto Serif / JetBrains Mono)
 *   - `#zcs-theme`  the active colour card's token + shape overrides
 *   - `#zcs-mascot` Deepy, anchored over the composer
 *   - `#zcs-panel-host` the settings panel (shadow DOM, so app CSS can't reach)
 *
 * The payload carries all four card×scheme stylesheets, the mascot frames and
 * the face block, so switching cards or following a light/dark change costs no
 * round trip to the CLI.
 *
 * Nothing here throws into the page: every probe is guarded, because this runs
 * inside someone else's app and a broken observer must not break chat.
 */
(() => {
  "use strict";

  const PREFIX = "zcs";
  const RUNTIME_VERSION = 10;
  // v2 used the long marker as an element id; drop anything it left behind.
  const LEGACY_IDS = ["theme", "fonts", "mascot", "panel-host"].map((k) => `zcode-claude-style-${k}`);
  const MARKER = "zcode-claude-style";
  const STATE_KEY = "zcs:state";
  const PAYLOAD_KEY = "zcs:payload";
  const THEME_KEYS = ["claude", "deepseek"];
  const MASCOT_STATES = [
    "idle",
    "thinking",
    "typing",
    "conducting",
    "notification",
    "error",
    "happy",
    "sleeping",
  ];


  // ---------------------------------------------------------------- payload

  let payload = window.__ZCS_PAYLOAD__ || null;
  if (!payload) {
    try {
      const raw = localStorage.getItem(PAYLOAD_KEY);
      if (raw) payload = JSON.parse(raw);
    } catch {}
  }
  if (!payload || !payload.css) return;

  /**
   * Idempotence is keyed on a fingerprint of this file, not a hand-bumped
   * version: the CLI hashes the source into the payload, so any edit to the
   * runtime forces a clean rebuild instead of silently running the old code.
   */
  const prior = window.__zcs;
  const runtimeId = (payload && payload.runtimeId) || null;
  if (prior) {
    if (runtimeId && prior.runtimeId === runtimeId) {
      prior.update(payload);
      return;
    }
    // A different build is already installed: tear its DOM down without
    // touching the reader's saved choices, then build this one from scratch.
    try {
      prior.teardown?.();
    } catch {}
  }

  function persist() {
    try {
      localStorage.setItem(PAYLOAD_KEY, JSON.stringify(payload));
    } catch {
      // Quota: keep the stylesheets (small) even when the frames do not fit.
      try {
        localStorage.setItem(
          PAYLOAD_KEY,
          JSON.stringify({ ...payload, mascot: {}, fonts: "" })
        );
      } catch {}
    }
  }

  // ------------------------------------------------------------------ state

  function loadState() {
    const defaults = payload.defaults || {};
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
    } catch {}
    const state = {
      card: THEME_KEYS.includes(saved.card) ? saved.card : defaults.card || "claude",
      mascot: typeof saved.mascot === "boolean" ? saved.mascot : defaults.mascot !== false,
      fonts: typeof saved.fonts === "boolean" ? saved.fonts : defaults.fonts !== false,
      motion: typeof saved.motion === "boolean" ? saved.motion : defaults.motion !== false,
      /*
       * Named `serifAll` rather than `serif` on purpose: when this setting
       * changed meaning from "serif headings" to "the whole interface in
       * serif", the old boolean sitting in localStorage would otherwise read as
       * the reader having explicitly chosen sans, and quietly override the new
       * default. A new key starts everyone from the default instead.
       */
      serifAll:
        typeof saved.serifAll === "boolean" ? saved.serifAll : defaults.serif !== false,
    };
    return state;
  }

  function saveState() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch {}
  }

  const state = loadState();

  // ------------------------------------------------------------------ theme

  function ensureStyle(id) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      (document.head || document.documentElement).appendChild(el);
    }
    return el;
  }

  /** ZCode puts `dark` on <html> for its dark scheme; follow it. */
  function currentScheme() {
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  }

  function applyTheme() {
    const card = payload.css[state.card] || payload.css.claude;
    const css = card[currentScheme()] || card.light;
    const el = ensureStyle(`${PREFIX}-theme`);
    if (el.textContent !== css) el.textContent = css;

    const fontsEl = ensureStyle(`${PREFIX}-fonts`);
    const faceCss = state.fonts ? payload.fonts || "" : "";
    if (fontsEl.textContent !== faceCss) fontsEl.textContent = faceCss;

    document.documentElement.setAttribute("data-zcs-skin", state.card);
    // Fingerprint of the assembled stylesheets. The resident host compares this
    // against its own build, so an edited stylesheet re-injects by itself
    // instead of leaving the user staring at a skin that is "online" but old.
    if (payload.styleId) document.documentElement.dataset.zcsStyleId = payload.styleId;
    // Who installed this skin, and when. The resident host only overwrites a
    // window whose stamp is older than its own build, so two live injectors
    // cannot ping-pong the stylesheet every few seconds.
    if (payload.builtAt) document.documentElement.dataset.zcsStyleAt = String(payload.builtAt);

    // Whole-interface face: its own sheet, mounted only when asked for. It
    // overrides --font-sans, which every piece of chrome inherits; --font-mono
    // is deliberately left alone so code keeps its alignment.
    const serifEl = document.getElementById(`${PREFIX}-serif`);
    if (state.serifAll) {
      const el = ensureStyle(`${PREFIX}-serif`);
      const css = payload.serifCss || "";
      if (el.textContent !== css) el.textContent = css;
    } else if (serifEl) {
      serifEl.remove();
    }

    // Motion rides its own style element: unmounting it is the toggle, and a
    // reader who turns motion off loses our transitions without losing the skin.
    const motionEl = document.getElementById(`${PREFIX}-motion`);
    if (state.motion) {
      const el = ensureStyle(`${PREFIX}-motion`);
      const css = payload.motionCss || "";
      if (el.textContent !== css) el.textContent = css;
    } else if (motionEl) {
      motionEl.remove();
    }
    if (state.fonts) document.documentElement.setAttribute("data-zcs-fonts", "1");
    else document.documentElement.removeAttribute("data-zcs-fonts");
  }

  // ---------------------------------------------------------------- mascot

  const mascot = (() => {
    let host = null;
    let img = null;
    let raf = 0;
    let anchorEl = null;
    let frameState = "idle";
    let timer = 0;
    let finishedTimer = 0;

    function build() {
      if (host) return;
      host = document.createElement("div");
      host.id = `${PREFIX}-mascot`;
      host.setAttribute("aria-hidden", "true");
      host.dataset.visible = "0";
      img = document.createElement("img");
      img.alt = "";
      img.draggable = false;
      host.appendChild(img);
      document.documentElement.appendChild(host);
    }

    /** The composer plate the whale rides on. */
    function findAnchor() {
      if (anchorEl && anchorEl.isConnected) return anchorEl;
      anchorEl = document.querySelector(
        "[data-composer-layout], .chat-composer-input-surface, .highspeed-composer-surface"
      );
      return anchorEl;
    }

    /**
     * The whale belongs to the composer, so it only exists where the composer
     * does. It has to disappear in two cases:
     *
     *   1. ZCode's own settings/plugins view, where the chat column is
     *      unmounted and there is no plate to sit on;
     *   2. the skin's own settings page, where the plate is still in the DOM
     *      but sits underneath the page — leaving it visible would paint a whale
     *      over a settings screen.
     *
     * Showing it at some fallback spot instead (the old behaviour) put it in the
     * middle of the plugins list.
     */
    function place() {
      raf = 0;
      if (!host) return;

      const pageOpen = Boolean(document.getElementById(`${PREFIX}-page-host`));
      const el = findAnchor();
      const rect = el ? el.getBoundingClientRect() : null;
      const measurable = Boolean(rect && rect.width > 0 && rect.height > 0);
      // A plate inside a hidden subtree reports a rect but no layout boxes;
      // offsetParent is null for anything display:none'd up the tree.
      const laidOut = measurable && (el.offsetParent !== null || getComputedStyle(el).position === "fixed");

      if (pageOpen || !laidOut) {
        host.dataset.visible = "0";
        return;
      }
      host.dataset.visible = "1";

      // Anchored to the right end of the plate: the whale reads as part of the
      // composer's trailing controls instead of floating over the transcript.
      host.style.left = `${Math.max(rect.left + 56, rect.right - 62)}px`;
      host.style.top = `${rect.top - 10}px`;
    }

    function schedulePlace() {
      if (!raf) raf = requestAnimationFrame(place);
    }

    function frame(name) {
      if (!payload.mascot || !payload.mascot[name]) return;
      frameState = name;
      if (img && img.dataset.frame !== name) {
        img.dataset.frame = name;
        img.src = payload.mascot[name];
      }
      if (host) host.dataset.state = name;
    }

    function setState(name) {
      if (!MASCOT_STATES.includes(name) || name === frameState) return;
      window.clearTimeout(finishedTimer);
      frame(name);
    }

    /** running → idle is the only reliable "it finished" signal we have. */
    function celebrate() {
      if (!payload.mascot || !payload.mascot.happy) return;
      frame("happy");
      finishedTimer = window.setTimeout(() => {
        frame(isRunning() ? "thinking" : "idle");
      }, 1600);
    }

    return {
      start() {
        build();
        schedulePlace();
        window.addEventListener("scroll", schedulePlace, { passive: true });
        window.addEventListener("resize", schedulePlace, { passive: true });
        const ro = new ResizeObserver(schedulePlace);
        const el = findAnchor();
        if (el) ro.observe(el);
        frame("idle");
        place();
      },
      stop() {
        window.clearTimeout(timer);
        window.clearTimeout(finishedTimer);
        if (host) host.remove();
        host = null;
        img = null;
        anchorEl = null;
      },
      visible(on) {
        if (!host) return;
        host.dataset.visible = on ? "1" : "0";
      },
      setState,
      celebrate,
      reanchor() {
        anchorEl = null;
        schedulePlace();
      },
      state: () => frameState,
    };
  })();

  // ---------------------------------------------------------------- probes

  const STOP_TEXT = /^(stop|interrupt|停止|中断|终止)/i;
  const APPROVE_TEXT = /(approve|allow|accept|确认|允许|同意|批准)/i;
  const ERROR_TEXT = /(error|failed|failure|错误|失败|异常)/i;

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
  }

  function isRunning() {
    if (document.querySelector('[data-testid="v4-running-subagent-stop"]')) return true;
    if (document.querySelector("[data-composer-thought-stop]")) return true;
    if (document.querySelector('[aria-busy="true"]')) return true;
    const buttons = document.querySelectorAll("button");
    for (const b of buttons) {
      const label = `${b.getAttribute("aria-label") || ""} ${b.textContent || ""}`.trim();
      if (STOP_TEXT.test(label) && isVisible(b)) return true;
    }
    return false;
  }

  function isConducting() {
    return Boolean(
      document.querySelector('[data-testid="v4-running-subagent-stop"]') ||
        document.querySelector('[data-testid="workflow-stream-chevrons"]')
    );
  }

  function needsAttention() {
    const dialogs = document.querySelectorAll('[role="alertdialog"], [role="dialog"]');
    for (const d of dialogs) {
      if (!isVisible(d)) continue;
      const buttons = d.querySelectorAll("button");
      for (const b of buttons) {
        if (APPROVE_TEXT.test(b.textContent || "")) return true;
      }
    }
    return false;
  }

  function hasError() {
    const nodes = document.querySelectorAll('[role="alert"], [data-sonner-toast], .toast');
    for (const n of nodes) {
      if (isVisible(n) && ERROR_TEXT.test(n.textContent || "")) return true;
    }
    return false;
  }

  // ----------------------------------------------------------- state machine

  let lastActivity = Date.now();
  let wasRunning = false;
  let errorUntil = 0;
  let asleep = false;

  function conversationRoot() {
    return (
      document.querySelector("[data-zcs-transcript]") ||
      document.querySelector("main") ||
      document.body
    );
  }

  let mutationTimer = 0;
  const observer = new MutationObserver(() => {
    const now = Date.now();
    if (now - mutationTimer < 400) return;
    mutationTimer = now;
    lastActivity = now;
    asleep = false;
    if (isRunning()) {
      mascot.setState(isConducting() ? "conducting" : "typing");
    }
  });

  function tick() {
    try {
      const running = isRunning();

      if (hasError()) errorUntil = Date.now() + 2600;

      if (Date.now() < errorUntil) {
        mascot.setState("error");
      } else if (needsAttention()) {
        mascot.setState("notification");
      } else if (running) {
        asleep = false;
        // Quiet while running means the model is thinking, not typing.
        const quiet = Date.now() - lastActivity;
        if (isConducting()) mascot.setState("conducting");
        else mascot.setState(quiet > 1200 ? "thinking" : "typing");
      } else if (wasRunning) {
        mascot.celebrate();
        asleep = false;
      } else if (Date.now() - lastActivity > 120000) {
        asleep = true;
        mascot.setState("sleeping");
      } else {
        mascot.setState("idle");
      }

      if (running && !wasRunning) {
        lastActivity = Date.now();
        observer.observe(conversationRoot(), {
          subtree: true,
          childList: true,
          characterData: true,
        });
      } else if (!running && wasRunning) {
        observer.disconnect();
        lastActivity = Date.now();
      }

      mascot.reanchor();
      wasRunning = running;
    } catch {
      // A probe failing must never break the app.
    }
  }

  // --------------------------------------------------- settings: nav row + page

  /**
   * The skin has no floating trigger: it adds a real row to the sidebar's nav
   * group (cloned from `插件市场`, so hover/active styles come from the host)
   * and opens a full page over the conversation column, the way the plugin
   * store does.
   *
   * The row is cloned markup, so React re-renders can drop it: a MutationObserver
   * puts it back when it disappears.
   */
  const settings = (() => {
    const LABEL = "cc-风格";
    const ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class="size-4" aria-hidden="true"><path d="M12 3.2v3.4M12 17.4v3.4M3.2 12h3.4M17.4 12h3.4M5.9 5.9l2.4 2.4M15.7 15.7l2.4 2.4M18.1 5.9l-2.4 2.4M8.3 15.7l-2.4 2.4"/><circle cx="12" cy="12" r="2.7"/></svg>`;

    let row = null;
    let navObserver = null;
    let host = null;
    let shadow = null;
    let ui = {};
    let isOpen = false;

    function navAnchor() {
      const aside = document.querySelector("aside");
      if (!aside) return null;
      const buttons = [...aside.querySelectorAll("button")];
      const template =
        buttons.find((b) => /^(插件市场|Plugins?|Plugin store)/i.test((b.textContent || "").trim())) ||
        buttons.find((b) => /^(自动化|Automations?)/i.test((b.textContent || "").trim())) ||
        buttons[0];
      if (!template || !template.parentElement) return null;
      return { container: template.parentElement, template };
    }

    function mountRow() {
      const anchor = navAnchor();
      if (!anchor) return false;
      const existing = anchor.container.querySelector("[data-zcs-nav]");
      if (existing) {
        row = existing;
        return true;
      }

      row = anchor.template.cloneNode(true);
      row.removeAttribute("data-testid");
      row.removeAttribute("aria-pressed");
      row.setAttribute("data-zcs-nav", "1");
      row.setAttribute("data-zcs-active", "0");
      row.setAttribute("aria-expanded", "false");
      row.title = "cc-风格 · Claude Code 观感";
      row.innerHTML = ICON;
      row.appendChild(document.createTextNode(LABEL));
      row.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        isOpen ? close() : open();
      });
      anchor.template.insertAdjacentElement("afterend", row);

      if (navObserver) navObserver.disconnect();
      navObserver = new MutationObserver(() => {
        if (row && !row.isConnected) {
          row = null;
          if (isOpen) close();
          mountRow();
        }
      });
      navObserver.observe(anchor.container, { childList: true });
      return true;
    }

    function markActive(on) {
      if (!row) return;
      row.setAttribute("data-zcs-active", on ? "1" : "0");
      row.setAttribute("aria-expanded", on ? "true" : "false");
    }

    /** The page covers the conversation column, leaving the sidebar clickable. */
    function place() {
      if (!host) return;
      const aside = document.querySelector("aside");
      const left = aside ? Math.round(aside.getBoundingClientRect().right) : 0;
      host.style.left = `${left}px`;
      host.style.top = "0px";
      host.style.right = "0px";
      host.style.bottom = "0px";
    }

    /**
     * Colour chips are painted through custom properties, not inline styles:
     * the renderer's CSP drops `style` attributes parsed from innerHTML, while
     * CSSOM (`style.setProperty`) still works.
     */
    function swatchHtml(card, label) {
      return `<button class="swatch" data-card="${card}">
        <span class="sw-name">${label}</span>
        <span class="sw-row">
          <span class="sw-chip" data-chip="canvas"></span>
          <span class="sw-chip" data-chip="sidebar"></span>
          <span class="sw-chip" data-chip="accent"></span>
          <span class="sw-chip" data-chip="ink"></span>
        </span>
      </button>`;
    }

    function paintSwatches() {
      const tones = payload.swatches || {};
      for (const el of shadow.querySelectorAll(".swatch")) {
        const t = tones[el.dataset.card] || {};
        for (const chip of ["canvas", "sidebar", "accent", "ink"]) {
          if (t[chip]) el.style.setProperty(`--chip-${chip}`, t[chip]);
        }
      }
    }

    function build() {
      if (host) return;
      host = document.createElement("div");
      host.id = `${PREFIX}-page-host`;
      host.setAttribute("data-zcs-skin-ui", "1");
      shadow = host.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = payload.panelCss || "";

      // Flat tones per card (canvas / sidebar / accent / ink) for the preview chips.

      const page = document.createElement("div");
      page.className = "page";
      page.innerHTML = `
        <header>
          <button class="back" data-role="back" aria-label="返回">←</button>
          <h1>${LABEL}</h1>
          <span class="tag">Claude Code Desktop 观感</span>
        </header>
        <div class="body">
          <section>
            <h2>色卡</h2>
            <div class="cards">
              ${swatchHtml("claude", "Claude")}
              ${swatchHtml("deepseek", "DeepSeek")}
            </div>
            <p class="note">每张卡自带画布、侧栏、强调色与三级墨色；暗色下边框是白色高光而不是灰线。</p>
          </section>

          <section>
            <h2>外观</h2>
            <div class="row">
              <span class="row-text"><span class="t">Deepy 鲸鱼</span><span class="s">输入框右端的八态小鲸鱼</span></span>
              <button class="sw" data-role="mascot" aria-label="Deepy 鲸鱼"></button>
            </div>
            <div class="row">
              <span class="row-text"><span class="t">字体</span><span class="s">Inter 正文 · JetBrains Mono 代码</span></span>
              <button class="sw" data-role="fonts" aria-label="字体"></button>
            </div>
            <div class="row">
              <span class="row-text"><span class="t">衬线字体</span><span class="s">正文、标题、界面统一用 Noto Serif；关掉回到 Inter（代码块始终等宽）</span></span>
              <button class="sw" data-role="serifAll" aria-label="衬线字体"></button>
            </div>
            <div class="row">
              <span class="row-text"><span class="t">动效</span><span class="s">控件反馈、浮层进出、按钮回弹（120–260ms）</span></span>
              <button class="sw" data-role="motion" aria-label="动效"></button>
            </div>
            <div class="row">
              <span class="row-text"><span class="t">明暗</span><span class="s">跟随 ZCode 自身主题，不做强制覆盖</span></span>
              <span class="value" data-role="scheme">—</span>
            </div>
          </section>

          <section>
            <h2>关于</h2>
            <div class="row">
              <span class="row-text"><span class="t">注入方式</span><span class="s">CDP 注入渲染进程，不改 app.asar；ZCode 重启后需重新注入</span></span>
              <span class="value" data-role="version">—</span>
            </div>
            <div class="row">
              <span class="row-text"><span class="t">复位</span><span class="s">回到 Claude 色卡，重新打开鲸鱼、字体与衬线</span></span>
              <button class="text-btn" data-role="reset">复位</button>
            </div>
          </section>
        </div>`;

      shadow.append(style, page);
      paintSwatches();
      ui = {
        back: page.querySelector('[data-role="back"]'),
        cards: page.querySelector(".cards"),
        mascot: page.querySelector('[data-role="mascot"]'),
        fonts: page.querySelector('[data-role="fonts"]'),
        serifAll: page.querySelector('[data-role="serifAll"]'),
        motion: page.querySelector('[data-role="motion"]'),
        scheme: page.querySelector('[data-role="scheme"]'),
        version: page.querySelector('[data-role="version"]'),
        reset: page.querySelector('[data-role="reset"]'),
      };

      ui.back.addEventListener("click", () => close());

      /**
       * Repaint the window inside a View Transition, so changing the colour card
       * reads as one surface sliding over another instead of a hard cut.
       *
       * Skipped on purpose when motion is off, when the reader asked for reduced
       * motion, or while a turn is streaming: the transition snapshots the whole
       * page, and a live transcript under a frozen snapshot shows up as a ghost.
       */
      function switchCard(next, after) {
        const commit = () => {
          state.card = next;
          saveState();
          applyTheme();
          if (after) after();
        };
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const streaming = Boolean(
          document.querySelector('[data-v4-running-live-tail="true"]')
        );
        if (
          !state.motion ||
          reduced ||
          streaming ||
          typeof document.startViewTransition !== "function"
        ) {
          commit();
          return;
        }
        try {
          const transition = document.startViewTransition(commit);
          // A skipped or aborted transition is not an error worth surfacing.
          transition.finished.catch(() => {});
        } catch {
          commit();
        }
      }

      ui.cards.addEventListener("click", (ev) => {
        const btn = ev.target.closest("[data-card]");
        if (!btn) return;
        if (btn.dataset.card === state.card) return;
        switchCard(btn.dataset.card, sync);
      });

      for (const key of ["mascot", "fonts", "motion", "serifAll"]) {
        ui[key].addEventListener("click", () => {
          state[key] = !state[key];
          saveState();
          applyTheme();
          if (key === "mascot") state.mascot ? mascot.start() : mascot.stop();
          sync();
        });
      }

      ui.reset.addEventListener("click", () => {
        state.mascot = true;
        state.fonts = true;
        state.motion = true;
        state.serifAll = true;
        mascot.start();
        // Same path as a card change, so "reset" crossfades rather than snapping.
        switchCard("claude", sync);
      });

      ui.version.textContent = "CDP · v" + (payload.build || "0.1.0");
    }

    function open() {
      build();
      if (!host.isConnected) document.documentElement.appendChild(host);
      place();
      isOpen = true;
      markActive(true);
      sync();
      window.addEventListener("resize", place, { passive: true });
      document.addEventListener("keydown", onKey, true);
    }

    function close() {
      isOpen = false;
      markActive(false);
      document.removeEventListener("keydown", onKey, true);
      if (host) host.remove();
      window.removeEventListener("resize", place);
    }

    function onKey(ev) {
      if (ev.key === "Escape" && isOpen) {
        ev.stopPropagation();
        close();
      }
    }

    function sync() {
      if (!ui.cards) return;
      for (const btn of ui.cards.querySelectorAll("[data-card]")) {
        btn.dataset.on = btn.dataset.card === state.card ? "1" : "0";
      }
      ui.mascot.dataset.on = state.mascot ? "1" : "0";
      ui.fonts.dataset.on = state.fonts ? "1" : "0";
      ui.serifAll.dataset.on = state.serifAll ? "1" : "0";
      ui.motion.dataset.on = state.motion ? "1" : "0";
      ui.scheme.textContent = currentScheme() === "dark" ? "暗色" : "浅色";
      const accent = payload.accent?.[state.card] || "#d97757";
      if (host) host.style.setProperty("--zcs-card-accent", accent);
    }

    return {
      start() {
        mountRow();
      },
      stop() {
        close();
        if (navObserver) navObserver.disconnect();
        navObserver = null;
        if (row) row.remove();
        row = null;
        if (host) host.remove();
        host = null;
        shadow = null;
        ui = {};
      },
      sync,
      refresh() {
        if (row && !row.isConnected) mountRow();
        if (isOpen) {
          host?.remove();
          host = null;
          shadow = null;
          ui = {};
          build();
          document.documentElement.appendChild(host);
          place();
          sync();
        }
      },
      get isOpen() {
        return isOpen;
      },
    };
  })();

  // ------------------------------------------------------------------ start

  function applyAll() {
    applyTheme();
    if (state.mascot) mascot.start();
    else mascot.stop();
    settings.start();
    settings.sync();
  }

  for (const id of [
    ...LEGACY_IDS,
    `${PREFIX}-theme`,
    `${PREFIX}-fonts`,
    `${PREFIX}-mascot`,
    `${PREFIX}-panel-host`,
  ]) {
    document.getElementById(id)?.remove();
  }

  applyAll();
  persist();

  // Follow the app's own light/dark switch.
  const htmlObserver = new MutationObserver(() => {
    if (htmlObserver._last !== currentScheme()) {
      htmlObserver._last = currentScheme();
      applyTheme();
    }
  });
  htmlObserver._last = currentScheme();
  htmlObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  const tickTimer = window.setInterval(tick, 500);
  tick();

  window.__zcs = {
    version: RUNTIME_VERSION,
    runtimeId,
    state,
    update(next) {
      payload = next;
      settings.refresh();
      applyAll();
      persist();
    },
    /** Removes every trace of the skin but keeps the reader's saved state. */
    teardown() {
      window.clearInterval(tickTimer);
      document.getElementById(`${PREFIX}-theme`)?.remove();
      // The motion sheet is a separate style element, so it has to be removed by
      // name too — leaving it behind keeps our transitions on the bare host.
      document.getElementById(`${PREFIX}-motion`)?.remove();
      document.getElementById(`${PREFIX}-serif`)?.remove();
      document.getElementById(`${PREFIX}-fonts`)?.remove();
      mascot.stop();
      settings.stop();
      document.documentElement.removeAttribute("data-zcs-skin");
      document.documentElement.removeAttribute("data-zcs-fonts");
      delete document.documentElement.dataset.zcsStyleId;
      delete document.documentElement.dataset.zcsStyleAt;
    },
    reset() {
      try {
        localStorage.removeItem(STATE_KEY);
        localStorage.removeItem(PAYLOAD_KEY);
      } catch {}
      this.teardown();
    },
    tick,
  };
})();
