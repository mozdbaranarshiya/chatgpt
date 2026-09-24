/* GPT Yar Commerce Admin v4.6.3
 * Authenticated admin UI for coupons and catalog prices.
 * It never overrides checkout totals in the browser.
 */
;(() => {
  "use strict";

  const STORE_KEY = "gptyarCommerceAdminConfigV1";
  const ROOT_ID = "gptyarCommerceAdminRoot";
  const BTN_ID = "gptyarCommerceAdminOpen";
  const DEFAULTS = {
    couponList: "/accupdator/coupons",
    couponCreate: "/accupdator/coupons",
    couponUpdate: "/accupdator/coupons/{id}",
    couponDelete: "/accupdator/coupons/{id}",
    productList: "/accupdator/products",
    productPriceUpdate: "/accupdator/products/{id}/price"
  };

  let cfg = Object.assign({}, DEFAULTS);
  let root = null;
  let coupons = [];

  function qs(sel, scope) { return (scope || document).querySelector(sel); }
  function qsa(sel, scope) { return Array.from((scope || document).querySelectorAll(sel)); }
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function apiBase() {
    try {
      if (typeof CONFIG !== "undefined" && CONFIG && CONFIG.API_SERVER) {
        return String(CONFIG.API_SERVER).replace(/\/$/, "");
      }
    } catch (_) {}
    return "https://api.gptyar.com";
  }
  function token() {
    try {
      return typeof PopupState !== "undefined" && PopupState && PopupState.token
        ? String(PopupState.token) : "";
    } catch (_) { return ""; }
  }
  function urlOf(tpl, values) {
    let path = String(tpl || "");
    Object.entries(values || {}).forEach(([k, v]) => {
      path = path.split("{" + k + "}").join(encodeURIComponent(String(v == null ? "" : v)));
    });
    if (/^https:\/\//i.test(path)) return path;
    if (path.charAt(0) !== "/") path = "/" + path;
    return apiBase() + path;
  }
  async function request(path, method, body, values) {
    const headers = {Accept: "application/json"};
    const t = token();
    if (t) headers.Authorization = "Bearer " + t;
    if (body !== undefined && body !== null) headers["Content-Type"] = "application/json";
    const response = await fetch(urlOf(path, values), {
      method: method || "GET",
      headers,
      cache: "no-store",
      body: body !== undefined && body !== null ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (_) { data = text; }
    }
    if (!response.ok) {
      const e = new Error("HTTP " + response.status + (text ? " - " + text.slice(0, 400) : ""));
      e.status = response.status;
      e.data = data;
      throw e;
    }
    return data;
  }
  function arrayOf(data, keys) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== "object") return [];
    for (const k of keys) if (Array.isArray(data[k])) return data[k];
    if (data.data) {
      if (Array.isArray(data.data)) return data.data;
      for (const k of keys) if (Array.isArray(data.data[k])) return data.data[k];
    }
    return [];
  }
  function couponId(x) { return x && (x.id || x.couponId || x.coupon_id || x.uuid || x.code); }
  function couponCode(x) { return x && (x.code || x.coupon || x.name || x.title) || "(بدون کد)"; }
  function status(msg, kind) {
    const el = qs("#commerceStatus", root);
    if (!el) return;
    el.className = "commerce-status " + (kind || "info");
    el.textContent = msg;
  }
  function setRaw(id, data) {
    const el = qs("#" + id, root);
    if (el) el.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  }
  function busy(btn, on, text) {
    if (!btn) return;
    if (on) {
      btn.dataset.oldText = btn.textContent;
      btn.disabled = true;
      btn.textContent = text || "در حال انجام...";
    } else {
      btn.disabled = false;
      btn.textContent = btn.dataset.oldText || btn.textContent;
    }
  }
  function saveConfig() {
    qsa("[data-api-key]", root).forEach(input => cfg[input.dataset.apiKey] = input.value.trim());
    chrome.storage.local.set({[STORE_KEY]: cfg}, () => status("مسیرهای API ذخیره شدند.", "ok"));
  }
  function resetConfig() {
    cfg = Object.assign({}, DEFAULTS);
    chrome.storage.local.set({[STORE_KEY]: cfg}, fillConfig);
    status("مسیرهای پیش‌فرض بازنشانی شدند.", "ok");
  }
  function fillConfig() {
    qsa("[data-api-key]", root).forEach(input => input.value = cfg[input.dataset.apiKey] || "");
  }
  function renderCoupons() {
    const list = qs("#commerceCouponList", root);
    if (!list) return;
    if (!coupons.length) {
      list.innerHTML = '<div class="commerce-note">موردی دریافت نشده است.</div>';
      return;
    }
    list.innerHTML = coupons.map(x => {
      const id = couponId(x);
      const value = x.value ?? x.amount ?? x.percent ?? x.discount ?? "";
      const type = x.type ?? x.discountType ?? x.discount_type ?? "";
      return '<button type="button" class="commerce-row" data-id="' + esc(id) + '">' +
        '<b>' + esc(couponCode(x)) + '</b><span>' + esc(type) + " " + esc(value) + "</span></button>";
    }).join("");
    qsa(".commerce-row", list).forEach(btn => btn.addEventListener("click", () => selectCoupon(btn.dataset.id)));
  }
  function selectCoupon(id) {
    const x = coupons.find(v => String(couponId(v)) === String(id));
    if (!x) return;
    qs("#couponId", root).value = couponId(x) || "";
    qs("#couponCode", root).value = couponCode(x) === "(بدون کد)" ? "" : couponCode(x);
    qs("#couponType", root).value = x.type || x.discountType || x.discount_type || "percent";
    qs("#couponValue", root).value = x.value ?? x.amount ?? x.percent ?? x.discount ?? "";
    qs("#couponMaxUses", root).value = x.maxUses ?? x.max_uses ?? x.usageLimit ?? "";
    qs("#couponActive", root).checked = x.active !== false && x.enabled !== false;
  }
  function couponPayload() {
    const max = qs("#couponMaxUses", root).value.trim();
    const payload = {
      code: qs("#couponCode", root).value.trim(),
      type: qs("#couponType", root).value,
      value: Number(qs("#couponValue", root).value),
      maxUses: max === "" ? null : Number(max),
      active: qs("#couponActive", root).checked
    };
    if (!payload.code) throw new Error("کد تخفیف الزامی است.");
    if (!Number.isFinite(payload.value) || payload.value < 0) throw new Error("مقدار تخفیف معتبر نیست.");
    if (payload.type === "percent" && payload.value > 100) throw new Error("درصد نمی‌تواند بیشتر از 100 باشد.");
    return payload;
  }
  async function loadCoupons(btn) {
    busy(btn, true, "دریافت...");
    try {
      const data = await request(cfg.couponList, "GET");
      coupons = arrayOf(data, ["coupons", "items", "results"]);
      renderCoupons();
      setRaw("couponRaw", data);
      status("API کد تخفیف فعال است.", "ok");
    } catch (e) {
      coupons = [];
      renderCoupons();
      setRaw("couponRaw", e.message);
      status("API کد تخفیف در دسترس نیست: " + e.message, "bad");
    } finally { busy(btn, false); }
  }
  async function createCoupon(btn) {
    try {
      const payload = couponPayload();
      if (!confirm("کد تخفیف " + payload.code + " ساخته شود؟")) return;
      busy(btn, true, "ساخت...");
      const data = await request(cfg.couponCreate, "POST", payload);
      setRaw("couponRaw", data);
      status("کد تخفیف ساخته شد.", "ok");
      await loadCoupons(null);
    } catch (e) { status("ساخت ناموفق: " + e.message, "bad"); }
    finally { busy(btn, false); }
  }
  async function updateCoupon(btn) {
    try {
      const id = qs("#couponId", root).value.trim();
      if (!id) throw new Error("شناسه کد تخفیف لازم است.");
      const payload = couponPayload();
      if (!confirm("کد تخفیف " + id + " ویرایش شود؟")) return;
      busy(btn, true, "ویرایش...");
      const data = await request(cfg.couponUpdate, "PATCH", payload, {id});
      setRaw("couponRaw", data);
      status("کد تخفیف ویرایش شد.", "ok");
      await loadCoupons(null);
    } catch (e) { status("ویرایش ناموفق: " + e.message, "bad"); }
    finally { busy(btn, false); }
  }
  async function deleteCoupon(btn) {
    try {
      const id = qs("#couponId", root).value.trim();
      if (!id) throw new Error("شناسه کد تخفیف لازم است.");
      if (!confirm("کد تخفیف " + id + " حذف شود؟")) return;
      busy(btn, true, "حذف...");
      const data = await request(cfg.couponDelete, "DELETE", null, {id});
      setRaw("couponRaw", data);
      status("کد تخفیف حذف شد.", "ok");
      await loadCoupons(null);
    } catch (e) { status("حذف ناموفق: " + e.message, "bad"); }
    finally { busy(btn, false); }
  }
  async function loadProducts(btn) {
    busy(btn, true, "دریافت...");
    try {
      const data = await request(cfg.productList, "GET");
      setRaw("productRaw", data);
      status("API محصول/قیمت فعال است.", "ok");
    } catch (e) {
      setRaw("productRaw", e.message);
      status("API محصول/قیمت در دسترس نیست: " + e.message, "bad");
    } finally { busy(btn, false); }
  }
  async function updatePrice(btn) {
    try {
      const id = qs("#productId", root).value.trim();
      const price = Number(qs("#productPrice", root).value);
      if (!id) throw new Error("Product ID الزامی است.");
      if (!Number.isFinite(price) || price < 0) throw new Error("قیمت معتبر نیست.");
      const body = {
        price,
        currency: qs("#productCurrency", root).value.trim() || "IRR",
        variantId: qs("#variantId", root).value.trim() || null,
        durationCode: qs("#durationCode", root).value.trim() || null
      };
      if (!confirm("قیمت Catalog برای " + id + " به " + price + " تغییر کند؟")) return;
      busy(btn, true, "ثبت...");
      const data = await request(cfg.productPriceUpdate, "PATCH", body, {id});
      setRaw("priceRaw", data);
      status("درخواست ویرایش قیمت ثبت شد.", "ok");
    } catch (e) { status("ویرایش قیمت ناموفق: " + e.message, "bad"); }
    finally { busy(btn, false); }
  }
  async function probe(btn) {
    busy(btn, true, "بررسی...");
    const out = [];
    try { await request(cfg.couponList, "GET"); out.push("Coupon API: OK"); }
    catch (e) { out.push("Coupon API: " + e.message); }
    try { await request(cfg.productList, "GET"); out.push("Product API: OK"); }
    catch (e) { out.push("Product API: " + e.message); }
    setRaw("probeRaw", out.join("\n"));
    busy(btn, false);
  }
  function injectStyle() {
    if (qs("#commerceAdminStyle")) return;
    const s = document.createElement("style");
    s.id = "commerceAdminStyle";
    s.textContent =
      ".commerce-open{width:100%;margin-top:10px;padding:10px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font:700 12px inherit;cursor:pointer}" +
      ".commerce-backdrop{position:fixed;inset:0;z-index:2147483600;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:10px}" +
      ".commerce-modal{direction:rtl;width:min(720px,100%);max-height:calc(100vh - 20px);overflow:hidden;background:#111827;color:#f8fafc;border:1px solid #334155;border-radius:16px;font-family:Vazirmatn,inherit}" +
      ".commerce-head{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid #334155}.commerce-head b{font-size:15px}.commerce-close{background:#334155;color:white;border:0;border-radius:8px;width:32px;height:32px;cursor:pointer}" +
      ".commerce-status{margin:10px 12px 0;padding:8px 10px;border-radius:8px;background:#1e3a8a;font-size:11px}.commerce-status.ok{background:#065f46}.commerce-status.bad{background:#7f1d1d}" +
      ".commerce-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:10px 12px}.commerce-tab{border:1px solid #334155;background:#1e293b;color:#cbd5e1;border-radius:8px;padding:8px;font:700 11px inherit;cursor:pointer}.commerce-tab.active{background:#334155;color:#fff}" +
      ".commerce-body{padding:12px;overflow:auto;max-height:calc(100vh - 155px)}.commerce-pane{display:none}.commerce-pane.active{display:block}.commerce-card{background:#0f172a;border:1px solid #273449;border-radius:12px;padding:11px;margin-bottom:10px}.commerce-card h3{font-size:12px;margin:0 0 9px}.commerce-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.commerce-field{display:flex;flex-direction:column;gap:4px}.commerce-field label{font-size:10px;color:#a5b4fc}.commerce-field input,.commerce-field select{border:1px solid #334155;background:#020617;color:#fff;border-radius:8px;padding:8px;font:11px inherit;box-sizing:border-box;width:100%}" +
      ".commerce-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}.commerce-btn{width:auto!important;flex:1 1 92px;min-width:0;border:0;border-radius:8px;padding:8px 10px;background:#334155;color:white;font:700 11px inherit;cursor:pointer}.commerce-btn.primary{background:#2563eb}.commerce-btn.success{background:#059669}.commerce-btn.danger{background:#dc2626}.commerce-btn.warn{background:#d97706}.commerce-btn:disabled{opacity:.55}" +
      ".commerce-list{display:flex;flex-direction:column;gap:6px;margin-top:9px}.commerce-row{width:100%!important;text-align:right;border:1px solid #334155;background:#020617;color:#fff;border-radius:8px;padding:8px;display:flex;justify-content:space-between;gap:8px;cursor:pointer}.commerce-row span{color:#94a3b8;font-size:10px}.commerce-field input[type=checkbox]{width:auto!important}.commerce-note{font-size:10px;color:#94a3b8;line-height:1.7}.commerce-json{direction:ltr;text-align:left;white-space:pre-wrap;max-height:180px;overflow:auto;background:#020617;border:1px solid #263247;border-radius:8px;padding:8px;font:10px monospace;color:#cbd5e1}" +
      "@media(max-width:560px){.commerce-grid{grid-template-columns:1fr}}";
    document.head.appendChild(s);
  }
  function configFields() {
    return Object.keys(DEFAULTS).map(k =>
      '<div class="commerce-field"><label>' + esc(k) + '</label><input data-api-key="' + esc(k) + '"></div>'
    ).join("");
  }
  function renderRoot() {
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML =
      '<div class="commerce-backdrop" hidden><div class="commerce-modal">' +
      '<div class="commerce-head"><div><b>مدیریت تخفیف و قیمت</b><div class="commerce-note">Backend Admin API</div></div><button class="commerce-close">×</button></div>' +
      '<div id="commerceStatus" class="commerce-status">آماده</div>' +
      '<div class="commerce-tabs"><button class="commerce-tab active" data-tab="coupon">کد تخفیف</button><button class="commerce-tab" data-tab="price">قیمت</button><button class="commerce-tab" data-tab="api">API</button></div>' +
      '<div class="commerce-body">' +
      '<section class="commerce-pane active" data-pane="coupon">' +
      '<div class="commerce-card"><h3>کدهای تخفیف</h3><div class="commerce-actions"><button id="couponLoad" class="commerce-btn">دریافت فهرست</button></div><div id="commerceCouponList" class="commerce-list"><div class="commerce-note">هنوز دریافت نشده است.</div></div></div>' +
      '<div class="commerce-card"><h3>ساخت / ویرایش</h3><div class="commerce-grid">' +
      '<div class="commerce-field"><label>ID</label><input id="couponId"></div><div class="commerce-field"><label>Code</label><input id="couponCode"></div>' +
      '<div class="commerce-field"><label>Type</label><select id="couponType"><option value="percent">percent</option><option value="fixed">fixed</option></select></div>' +
      '<div class="commerce-field"><label>Value</label><input id="couponValue" type="number" min="0"></div>' +
      '<div class="commerce-field"><label>Max uses</label><input id="couponMaxUses" type="number" min="0"></div>' +
      '<div class="commerce-field"><label>Active</label><label><input id="couponActive" type="checkbox" checked> فعال</label></div></div>' +
      '<div class="commerce-actions"><button id="couponCreate" class="commerce-btn success">ساخت</button><button id="couponUpdate" class="commerce-btn primary">ویرایش</button><button id="couponDelete" class="commerce-btn danger">حذف</button></div></div>' +
      '<div class="commerce-card"><h3>Response</h3><pre id="couponRaw" class="commerce-json">—</pre></div></section>' +
      '<section class="commerce-pane" data-pane="price">' +
      '<div class="commerce-card"><h3>محصولات</h3><div class="commerce-actions"><button id="productLoad" class="commerce-btn">دریافت محصولات</button></div><pre id="productRaw" class="commerce-json">—</pre></div>' +
      '<div class="commerce-card"><h3>ویرایش قیمت Catalog</h3><div class="commerce-note">فقط API مدیریتی Backend فراخوانی می‌شود؛ Checkout سمت مرورگر تغییر نمی‌کند.</div><div class="commerce-grid">' +
      '<div class="commerce-field"><label>Product ID</label><input id="productId"></div><div class="commerce-field"><label>Variant ID</label><input id="variantId"></div>' +
      '<div class="commerce-field"><label>Duration</label><input id="durationCode" placeholder="1m"></div><div class="commerce-field"><label>Currency</label><input id="productCurrency" value="IRR"></div>' +
      '<div class="commerce-field"><label>Price</label><input id="productPrice" type="number" min="0"></div></div><div class="commerce-actions"><button id="priceUpdate" class="commerce-btn warn">ثبت قیمت</button></div><pre id="priceRaw" class="commerce-json">—</pre></div></section>' +
      '<section class="commerce-pane" data-pane="api"><div class="commerce-card"><h3>Endpointها</h3><div class="commerce-note">مسیرها قابل تنظیم‌اند چون endpointهای Commerce در v4.6.2 وجود نداشتند.</div><div class="commerce-grid">' + configFields() + '</div>' +
      '<div class="commerce-actions"><button id="apiSave" class="commerce-btn primary">ذخیره</button><button id="apiReset" class="commerce-btn">پیش‌فرض</button><button id="apiProbe" class="commerce-btn success">بررسی</button></div></div><div class="commerce-card"><pre id="probeRaw" class="commerce-json">—</pre></div></section>' +
      '</div></div></div>';
    document.body.appendChild(root);

    qs(".commerce-close", root).addEventListener("click", close);
    qs(".commerce-backdrop", root).addEventListener("click", e => { if (e.target.classList.contains("commerce-backdrop")) close(); });
    qsa(".commerce-tab", root).forEach(tab => tab.addEventListener("click", () => {
      qsa(".commerce-tab", root).forEach(x => x.classList.toggle("active", x === tab));
      qsa(".commerce-pane", root).forEach(x => x.classList.toggle("active", x.dataset.pane === tab.dataset.tab));
    }));
    qs("#couponLoad", root).addEventListener("click", e => loadCoupons(e.currentTarget));
    qs("#couponCreate", root).addEventListener("click", e => createCoupon(e.currentTarget));
    qs("#couponUpdate", root).addEventListener("click", e => updateCoupon(e.currentTarget));
    qs("#couponDelete", root).addEventListener("click", e => deleteCoupon(e.currentTarget));
    qs("#productLoad", root).addEventListener("click", e => loadProducts(e.currentTarget));
    qs("#priceUpdate", root).addEventListener("click", e => updatePrice(e.currentTarget));
    qs("#apiSave", root).addEventListener("click", saveConfig);
    qs("#apiReset", root).addEventListener("click", resetConfig);
    qs("#apiProbe", root).addEventListener("click", e => probe(e.currentTarget));
  }
  function open() { fillConfig(); qs(".commerce-backdrop", root).hidden = false; }
  function close() { qs(".commerce-backdrop", root).hidden = true; }
  function ensureToolsHost() {
    const section = qs("#accupdator-section");
    if (!section) return null;
    const content = qs(".accupdator-content", section) || qs("#accupdatorPanel", section);
    if (!content) return null;

    let card = qs("#gptyarCommerceToolsCard", section);
    if (!card) {
      card = document.createElement("div");
      card.id = "gptyarCommerceToolsCard";
      card.className = "accupdator-section-card";
      card.innerHTML =
        '<div class="section-card-header"><span>ابزارهای فروشگاه</span></div>' +
        '<div class="section-card-content"><div id="gptyarCommerceToolsButtons" class="accupdator-buttons"></div></div>';
      content.appendChild(card);
    }
    return qs("#gptyarCommerceToolsButtons", card);
  }
  function ensureButton() {
    const target = ensureToolsHost();
    if (!target) return;

    let btn = qs("#" + BTN_ID);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.className = "accupdator-btn secondary-btn";
      btn.type = "button";
      btn.textContent = "مدیریت تخفیف و قیمت";
      btn.addEventListener("click", open);
    }
    if (btn.parentElement !== target) target.appendChild(btn);
  }
  function init() {
    injectStyle();
    chrome.storage.local.get([STORE_KEY], result => {
      cfg = Object.assign({}, DEFAULTS, result && result[STORE_KEY] || {});
      renderRoot();
      fillConfig();
      ensureButton();
      new MutationObserver(ensureButton).observe(document.documentElement, {childList: true, subtree: true});
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once: true});
  else init();
})();