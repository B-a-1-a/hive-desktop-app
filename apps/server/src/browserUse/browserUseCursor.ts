/**
 * agent-browser init script that draws a cursor where the agent's input lands, so the person can
 * follow it in the headed window. agent-browser sends mouse input through CDP, which fires real
 * DOM events in the page; the overlay listens for them and never takes pointer events itself.
 */
export const BROWSER_USE_CURSOR_SCRIPT = `(() => {
  if (window.top !== window || window.__hiveBrowserUseCursor) return;
  window.__hiveBrowserUseCursor = true;
  let host = null;
  let shadow = null;
  let pointer = null;
  let x = -40;
  let y = -40;
  const mount = () => {
    if (host && host.isConnected) return true;
    const root = document.documentElement;
    if (!root) return false;
    host = document.createElement("hive-browser-use-cursor");
    host.style.cssText = "all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647";
    shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = '<style>' +
      '.p{position:fixed;left:0;top:0;width:28px;height:28px;transition:transform 160ms ease-out;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))}' +
      '.r{position:fixed;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;border:3px solid #f59e0b;animation:r 450ms ease-out forwards}' +
      '.t{position:fixed;padding:2px 7px;border-radius:6px;background:#111;color:#fff;font:600 12px system-ui,sans-serif;animation:f 900ms ease-out forwards}' +
      '@keyframes r{from{transform:scale(.4);opacity:1}to{transform:scale(1.7);opacity:0}}' +
      '@keyframes f{0%,70%{opacity:1}to{opacity:0}}' +
      '</style><svg class="p" viewBox="0 0 28 28"><path d="M4 2l19 10-8.2 2.1L10.8 23z" fill="#f59e0b" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    pointer = shadow.querySelector(".p");
    root.appendChild(host);
    if (x >= 0) place();
    return true;
  };
  const place = () => {
    pointer.style.transform = "translate(" + (x - 4) + "px," + (y - 2) + "px)";
  };
  const move = (nx, ny) => {
    x = nx;
    y = ny;
    if (mount()) place();
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
  const toElement = (target) => {
    if (!(target instanceof Element)) return;
    const box = target.getBoundingClientRect();
    move(box.left + Math.min(box.width / 2, 24), box.top + box.height / 2);
  };
  addEventListener("mousemove", (event) => move(event.clientX, event.clientY), true);
  addEventListener("mousedown", (event) => { move(event.clientX, event.clientY); flash("r"); }, true);
  addEventListener("input", (event) => { toElement(event.target); flash("t", "typing"); }, true);
  addEventListener("keydown", () => {
    const active = document.activeElement;
    if (active && active !== document.body) toElement(active);
  }, true);
})();
`;
