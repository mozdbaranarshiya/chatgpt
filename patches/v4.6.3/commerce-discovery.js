/* GPT Yar Commerce API Discovery v4.6.3
 * Passive request observer for gptyar.com / api.gptyar.com.
 * Does not block, alter, replay, or create requests.
 */
;(() => {
  "use strict";

  const BTN_ID = "gptyarCommerceDiscoveryOpen";
  const ROOT_ID = "gptyarCommerceDiscoveryRoot";

  const REDACT_RE = /(authorization|cookie|token|secret|password|passwd|pass|otp|mfa|phone|mobile|email|session|bearer|csrf|api[-_]?key)/i;
  const COMMERCE_RE = /(coupon|discount|promo|voucher|product|variant|price|amount|total|checkout|cart|order|payment|invoice)/i;

  function qs(sel, scope) { return (scope || document).querySelector(sel); }
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function activeTab() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({active: true, currentWindow: true}, tabs => {
        const err = chrome.runtime.lastError;
        if (err) return reject(new Error(err.message));
        const tab = tabs && tabs[0];
        if (!tab || !tab.id) return reject(new Error("تب فعال پیدا نشد."));
        resolve(tab);
      });
    });
  }
  async function exec(func, args) {
    const tab = await activeTab();
    const url = String(tab.url || "");
    if (!/^https:\/\/([^.]+\.)?gptyar\.com\//i.test(url)) {
      throw new Error("ابتدا یکی از صفحات gptyar.com را در تب فعال باز کنید.");
    }
    const result = await chrome.scripting.executeScript({
      target: {tabId: tab.id},
      world: "MAIN",
      func,
      args: args || []
    });
    return result && result[0] ? result[0].result : null;
  }

  function installObserver() {
    const KEY = "__GPT_YAR_API_DISCOVERY_V1__";
    const STORAGE_KEY = "__gptyar_api_discovery_logs_v1__";
    const COMMERCE_RE_PAGE = /(coupon|discount|promo|voucher|product|variant|price|amount|total|checkout|cart|order|payment|invoice)/i;
    const REDACT_RE_PAGE = /(authorization|cookie|token|secret|password|passwd|pass|otp|mfa|phone|mobile|email|session|bearer|csrf|api[-_]?key)/i;

    if (window[KEY] && window[KEY].installed) {
      return {installed: true, alreadyInstalled: true, count: window[KEY].logs.length};
    }

    function allowedUrl(url) {
      try {
        const u = new URL(String(url), location.href);
        return u.hostname === "gptyar.com" || u.hostname.endsWith(".gptyar.com");
      } catch (_) { return false; }
    }
    function redact(value, depth) {
      if (depth > 5) return "[max-depth]";
      if (Array.isArray(value)) return value.slice(0, 50).map(v => redact(v, depth + 1));
      if (value && typeof value === "object") {
        const out = {};
        Object.entries(value).slice(0, 100).forEach(([k, v]) => {
          out[k] = REDACT_RE_PAGE.test(k) ? "[REDACTED]" : redact(v, depth + 1);
        });
        return out;
      }
      if (typeof value === "string") return value.length > 2000 ? value.slice(0, 2000) + "…" : value;
      return value;
    }
    function sanitizeText(text) {
      if (typeof text !== "string") return text;
      if (text.length > 6000) text = text.slice(0, 6000) + "…";
      try { return redact(JSON.parse(text), 0); } catch (_) {
        return text
          .replace(/("?(?:authorization|cookie|token|secret|password|passwd|pass|otp|mfa|phone|mobile|email|session|bearer|csrf|api[-_]?key)"?\s*[:=]\s*)("[^"]*"|'[^']*'|[^,\s&]+)/ig, "$1[REDACTED]");
      }
    }
    function bodyToSafe(body) {
      if (body == null) return null;
      if (typeof body === "string") return sanitizeText(body);
      if (body instanceof URLSearchParams) return sanitizeText(body.toString());
      if (body instanceof FormData) {
        const out = {};
        for (const [k, v] of body.entries()) {
          out[k] = REDACT_RE_PAGE.test(k) ? "[REDACTED]" : (typeof v === "string" ? v.slice(0, 500) : "[File]");
        }
        return out;
      }
      return "[non-text body]";
    }
    function loadSaved() {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.slice(-200) : [];
      } catch (_) { return []; }
    }
    function save(logs) {
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(-200))); } catch (_) {}
    }
    const state = {
      installed: true,
      installedAt: new Date().toISOString(),
      logs: loadSaved(),
      realFetch: window.fetch,
      realOpen: XMLHttpRequest.prototype.open,
      realSend: XMLHttpRequest.prototype.send
    };
    window[KEY] = state;

    function add(entry) {
      state.logs.push(entry);
      if (state.logs.length > 200) state.logs.splice(0, state.logs.length - 200);
      save(state.logs);
    }

    if (typeof state.realFetch === "function") {
      window.fetch = async function(input, init) {
        const request = input instanceof Request ? input : null;
        const url = request ? request.url : String(input);
        const method = String((init && init.method) || (request && request.method) || "GET").toUpperCase();
        const body = init && Object.prototype.hasOwnProperty.call(init, "body") ? init.body : null;
        const safeBody = bodyToSafe(body);
        const shouldObserve = allowedUrl(url);
        const started = Date.now();

        try {
          const response = await state.realFetch.apply(this, arguments);
          if (shouldObserve) {
            let preview = null;
            try {
              const ct = response.headers && response.headers.get("content-type") || "";
              if (/json|text|javascript/i.test(ct)) {
                const txt = await response.clone().text();
                if (COMMERCE_RE_PAGE.test(url) || COMMERCE_RE_PAGE.test(String(txt)) || COMMERCE_RE_PAGE.test(JSON.stringify(safeBody))) {
                  preview = sanitizeText(txt);
                }
              }
            } catch (_) {}
            add({
              ts: new Date().toISOString(),
              transport: "fetch",
              method,
              url: new URL(url, location.href).href,
              status: response.status,
              ms: Date.now() - started,
              body: safeBody,
              response: preview,
              commerceHint: COMMERCE_RE_PAGE.test(url) || COMMERCE_RE_PAGE.test(JSON.stringify(safeBody)) || COMMERCE_RE_PAGE.test(JSON.stringify(preview))
            });
          }
          return response;
        } catch (error) {
          if (shouldObserve) {
            add({
              ts: new Date().toISOString(),
              transport: "fetch",
              method,
              url: new URL(url, location.href).href,
              status: "ERROR",
              ms: Date.now() - started,
              body: safeBody,
              response: String(error && error.message || error),
              commerceHint: COMMERCE_RE_PAGE.test(url) || COMMERCE_RE_PAGE.test(JSON.stringify(safeBody))
            });
          }
          throw error;
        }
      };
    }

    XMLHttpRequest.prototype.open = function(method, url) {
      this.__gptyarDiscovery = {
        method: String(method || "GET").toUpperCase(),
        url: new URL(String(url), location.href).href
      };
      return state.realOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function(body) {
      const meta = this.__gptyarDiscovery;
      if (meta && allowedUrl(meta.url)) {
        const started = Date.now();
        const safeBody = bodyToSafe(body);
        this.addEventListener("loadend", function() {
          let preview = null;
          try {
            const txt = typeof this.responseText === "string" ? this.responseText : "";
            if (COMMERCE_RE_PAGE.test(meta.url) || COMMERCE_RE_PAGE.test(txt) || COMMERCE_RE_PAGE.test(JSON.stringify(safeBody))) {
              preview = sanitizeText(txt);
            }
          } catch (_) {}
          add({
            ts: new Date().toISOString(),
            transport: "xhr",
            method: meta.method,
            url: meta.url,
            status: this.status,
            ms: Date.now() - started,
            body: safeBody,
            response: preview,
            commerceHint: COMMERCE_RE_PAGE.test(meta.url) || COMMERCE_RE_PAGE.test(JSON.stringify(safeBody)) || COMMERCE_RE_PAGE.test(JSON.stringify(preview))
          });
        });
      }
      return state.realSend.apply(this, arguments);
    };

    return {installed: true, alreadyInstalled: false, count: state.logs.length};
  }

  function readObserverLogs() {
    const KEY = "__GPT_YAR_API_DISCOVERY_V1__";
    const STORAGE_KEY = "__gptyar_api_discovery_logs_v1__";
    let logs = [];
    if (window[KEY] && Array.isArray(window[KEY].logs)) logs = window[KEY].logs;
    else {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        logs = raw ? JSON.parse(raw) : [];
      } catch (_) {}
    }
    if (!Array.isArray(logs)) logs = [];
    return {
      page: location.href,
      installed: !!(window[KEY] && window[KEY].installed),
      logs: logs.slice(-200)
    };
  }

  function clearObserverLogs() {
    const KEY = "__GPT_YAR_API_DISCOVERY_V1__";
    const STORAGE_KEY = "__gptyar_api_discovery_logs_v1__";
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
    if (window[KEY] && Array.isArray(window[KEY].logs)) window[KEY].logs.length = 0;
    return true;
  }

  function injectStyle() {
    if (qs("#gptyarDiscoveryStyle")) return;
    const style = document.createElement("style");
    style.id = "gptyarDiscoveryStyle";
    style.textContent =
      ".discovery-open{width:100%;margin-top:8px;padding:10px;border:0;border-radius:10px;background:#0f766e;color:#fff;font:700 12px inherit;cursor:pointer}" +
      ".discovery-backdrop{position:fixed;inset:0;z-index:2147483640;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:10px}" +
      ".discovery-modal{direction:rtl;width:min(760px,100%);max-height:calc(100vh - 20px);overflow:hidden;background:#111827;color:#f8fafc;border:1px solid #334155;border-radius:16px;font-family:Vazirmatn,inherit}" +
      ".discovery-head{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid #334155}.discovery-close{background:#334155;color:#fff;border:0;border-radius:8px;width:32px;height:32px;cursor:pointer}" +
      ".discovery-body{padding:12px;overflow:auto;max-height:calc(100vh - 80px)}.discovery-note{font-size:10px;color:#94a3b8;line-height:1.8}.discovery-actions{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0}.discovery-btn{border:0;border-radius:8px;padding:8px 10px;background:#334155;color:white;font:700 11px inherit;cursor:pointer}.discovery-btn.primary{background:#0f766e}.discovery-btn.danger{background:#b91c1c}" +
      ".discovery-status{padding:8px 10px;border-radius:8px;background:#1e3a8a;font-size:11px;margin-bottom:10px}.discovery-status.ok{background:#065f46}.discovery-status.bad{background:#7f1d1d}.discovery-output{direction:ltr;text-align:left;white-space:pre-wrap;max-height:420px;overflow:auto;background:#020617;border:1px solid #263247;border-radius:8px;padding:9px;font:10px monospace;color:#cbd5e1}";
    document.head.appendChild(style);
  }
  function status(msg, kind) {
    const el = qs("#discoveryStatus");
    if (!el) return;
    el.className = "discovery-status " + (kind || "");
    el.textContent = msg;
  }
  function formatLogs(data) {
    if (!data || !Array.isArray(data.logs)) return "گزارشی موجود نیست.";
    const important = data.logs.filter(x => x.commerceHint);
    const source = important.length ? important : data.logs;
    if (!source.length) return "هنوز هیچ درخواست gptyar.com ثبت نشده است.";
    return source.map((x, i) => {
      const lines = [
        "#" + (i + 1) + "  " + x.ts,
        x.method + " " + x.url,
        "status=" + x.status + " transport=" + x.transport + " duration=" + x.ms + "ms"
      ];
      if (x.body != null) lines.push("BODY:\n" + JSON.stringify(x.body, null, 2));
      if (x.response != null) lines.push("RESPONSE:\n" + (typeof x.response === "string" ? x.response : JSON.stringify(x.response, null, 2)));
      return lines.join("\n");
    }).join("\n\n------------------------------\n\n");
  }
  function render() {
    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML =
      '<div class="discovery-backdrop" hidden><div class="discovery-modal">' +
      '<div class="discovery-head"><div><b>کشف API فروشگاه</b><div class="discovery-note">ثبت غیرفعال‌نشونده و بدون تغییر درخواست‌ها</div></div><button class="discovery-close">×</button></div>' +
      '<div class="discovery-body"><div id="discoveryStatus" class="discovery-status">آماده</div>' +
      '<div class="discovery-note">۱) صفحه موردنظر در gptyar.com را فعال کنید. ۲) «شروع ثبت» را بزنید. ۳) در سایت عملیات مدیریتی/محصول/تخفیف را انجام دهید. ۴) دوباره افزونه را باز کنید و «خواندن گزارش» را بزنید. مقادیر حساس مانند Token، Cookie، شماره تماس، ایمیل و رمز عبور حذف می‌شوند.</div>' +
      '<div class="discovery-actions"><button id="discoveryStart" class="discovery-btn primary">شروع ثبت</button><button id="discoveryRead" class="discovery-btn">خواندن گزارش</button><button id="discoveryClear" class="discovery-btn danger">پاک کردن گزارش</button></div>' +
      '<pre id="discoveryOutput" class="discovery-output">—</pre></div></div></div>';
    document.body.appendChild(root);

    qs(".discovery-close", root).addEventListener("click", () => qs(".discovery-backdrop", root).hidden = true);
    qs(".discovery-backdrop", root).addEventListener("click", e => {
      if (e.target.classList.contains("discovery-backdrop")) e.currentTarget.hidden = true;
    });
    qs("#discoveryStart", root).addEventListener("click", async () => {
      try {
        const result = await exec(installObserver);
        status(result && result.alreadyInstalled ? "ثبت از قبل فعال بود." : "ثبت فعال شد. حالا در همان تب عملیات موردنظر را انجام دهید.", "ok");
      } catch (e) { status(e.message, "bad"); }
    });
    qs("#discoveryRead", root).addEventListener("click", async () => {
      try {
        const data = await exec(readObserverLogs);
        qs("#discoveryOutput", root).textContent = formatLogs(data);
        status("گزارش خوانده شد: " + ((data && data.logs && data.logs.length) || 0) + " درخواست.", "ok");
      } catch (e) { status(e.message, "bad"); }
    });
    qs("#discoveryClear", root).addEventListener("click", async () => {
      try {
        await exec(clearObserverLogs);
        qs("#discoveryOutput", root).textContent = "—";
        status("گزارش پاک شد.", "ok");
      } catch (e) { status(e.message, "bad"); }
    });
  }
  function ensureButton() {
    if (qs("#" + BTN_ID)) return;
    const section = qs("#accupdator-section") || document.body;
    const target = qs(".accupdator-buttons", section) || qs("#accupdatorPanel", section) || section;
    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.className = "discovery-open";
    btn.textContent = "کشف API فروشگاه";
    btn.addEventListener("click", () => qs(".discovery-backdrop", document.getElementById(ROOT_ID)).hidden = false);
    target.appendChild(btn);
  }
  function init() {
    injectStyle();
    render();
    ensureButton();
    new MutationObserver(ensureButton).observe(document.documentElement, {childList: true, subtree: true});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once: true});
  else init();
})();