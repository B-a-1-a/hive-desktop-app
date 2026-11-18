/**
 * agent-browser init script that draws a cursor where the agent's input lands, so the person can
 * follow it in the headed window. agent-browser sends mouse input through CDP, which fires real
 * DOM events in the page; the overlay listens for them and never takes pointer events itself.
 *
 * Init scripts run in every frame. Only the top frame draws; a child frame turns its events into
 * its own viewport coordinates and posts them to its parent, which adds where that iframe's
 * content box sits and passes them up, so input inside iframes (cross-origin ones included) moves
 * the same pointer. The last position is kept in sessionStorage so the pointer reappears where it
 * was when a new page of the same site loads, instead of vanishing until the next input.
 */
export const BROWSER_USE_CURSOR_SCRIPT = `(() => {
  if (window.__hiveBrowserUseCursor) return;
  window.__hiveBrowserUseCursor = true;
  const KEY = "__hiveBrowserUseCursor";
  const isTop = window.top === window;
  const finite = (value) => typeof value === "number" && isFinite(value);

  let send;
  if (isTop) {
    let host = null;
    let shadow = null;
    let pointer = null;
    let x = -40;
    let y = -40;
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
      if (saved && finite(saved.x) && finite(saved.y)) {
        x = saved.x;
        y = saved.y;
      }
    } catch {}
    const save = () => {
      try { sessionStorage.setItem(KEY, JSON.stringify({ x, y })); } catch {}
    };
    const place = () => {
      pointer.style.transform = "translate(" + (x - 4) + "px," + (y - 2) + "px)";
    };
    const mount = () => {
      if (host && host.isConnected) return true;
      const root = document.documentElement;
      if (!root) return false;
      if (!host) {
        host = document.createElement("hive-browser-use-cursor");
        host.style.cssText = "all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647";
        shadow = host.attachShadow({ mode: "closed" });
        shadow.innerHTML = '<style>' +
          '.p{position:fixed;left:0;top:0;width:28px;height:28px;transform:translate(-40px,-40px);transition:transform 160ms ease-out;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))}' +
          '.r{position:fixed;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;border:3px solid #f59e0b;animation:r 450ms ease-out forwards}' +
          '.t{position:fixed;padding:2px 7px;border-radius:6px;background:#111;color:#fff;font:600 12px system-ui,sans-serif;animation:f 900ms ease-out forwards}' +
          '@keyframes r{from{transform:scale(.4);opacity:1}to{transform:scale(1.7);opacity:0}}' +
          '@keyframes f{0%,70%{opacity:1}to{opacity:0}}' +
          '</style><svg class="p" viewBox="0 0 28 28"><path d="M4 2l19 10-8.2 2.1L10.8 23z" fill="#f59e0b" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
        pointer = shadow.querySelector(".p");
      }
      root.appendChild(host);
      if (x >= 0) place();
      return true;
    };
    const flash = (className, text) => {
      if (!mount()) return;
      const el = document.createElement("div");
      el.className = className;
      el.style.left = x + "px";
      el.style.top = (className === "t" ? y + 22 : y) + "px";
      if (text) el.textContent = text;
      shadow.appendChild(el);
      setTimeout(() => el.remove(), 1000);
    };
    send = (kind, nx, ny) => {
      x = nx;
      y = ny;
      save();
      if (!mount()) return;
      place();
      if (kind === "down") flash("r");
      else if (kind === "type") flash("t", "typing");
    };
    // Show the pointer where it was on the previous page, and put it back if the page replaces
    // the children of <html> (some frameworks do while hydrating).
    const watch = () => {
      if (x >= 0) mount();
      if (document.documentElement) {
        new MutationObserver(() => {
          if (host && !host.isConnected && x >= 0) mount();
        }).observe(document.documentElement, { childList: true });
      }
    };
    if (document.documentElement) watch();
    else document.addEventListener("readystatechange", watch, { once: true });
  } else {
    send = (kind, nx, ny) => {
      try { parent.postMessage({ [KEY]: true, kind, x: nx, y: ny }, "*"); } catch {}
    };
  }

  // A child frame reported input in its own viewport; shift it by where that iframe's content box
  // sits in this frame's viewport. Anything that is not from one of this frame's iframes is ignored.
  addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data[KEY] !== true || !finite(data.x) || !finite(data.y)) return;
    if (data.kind !== "move" && data.kind !== "down" && data.kind !== "type") return;
    for (const frame of document.querySelectorAll("iframe, frame")) {
      if (frame.contentWindow !== event.source) continue;
      const box = frame.getBoundingClientRect();
      const style = getComputedStyle(frame);
      send(
        data.kind,
        box.left + frame.clientLeft + (parseFloat(style.paddingLeft) || 0) + data.x,
        box.top + frame.clientTop + (parseFloat(style.paddingTop) || 0) + data.y,
      );
      return;
    }
  }, true);

  const elementPoint = (target) => {
    const box = target.getBoundingClientRect();
    return [box.left + Math.min(box.width / 2, 24), box.top + box.height / 2];
  };
  addEventListener("mousemove", (event) => send("move", event.clientX, event.clientY), true);
  addEventListener("mousedown", (event) => send("down", event.clientX, event.clientY), true);
  addEventListener("input", (event) => {
    if (event.target instanceof Element) send("type", ...elementPoint(event.target));
  }, true);
  addEventListener("keydown", () => {
    const active = document.activeElement;
    if (active && active !== document.body && !(active instanceof HTMLIFrameElement)) {
      send("move", ...elementPoint(active));
    }
  }, true);
})();
`;
