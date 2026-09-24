/* GPT Yar Commerce Admin v4.6.3
 * Verified storefront endpoints + configurable authenticated admin endpoints.
 * Verified endpoints are used only for read/validation actions in the active gptyar.com tab.
 * Unknown admin write routes stay disabled until explicitly configured.
 */
;(() => {
  "use strict";

  const STORE_KEY = "gptyarCommerceAdminConfigV2";
  const ROOT_ID = "gptyarCommerceAdminRoot";
  const BTN_ID = "gptyarCommerceAdminOpen";

  const DEFAULTS = {
    discountValidate: "https://www.gptyar.com/api/checkout/discount",
    cartRead: "https://www.gptyar.com/api/cart",
    couponList: "",
    couponCreate: "",
    couponUpdate: "",
    couponDelete: "",
    productList: "",
    productPriceUpdate: ""
  };

  let cfg = {...DEFAULTS};
  let root = null;
  let coupons = [];

  const $ = (s, scope=document) => scope.querySelector(s);
  const $$ = (s, scope=document) => Array.from(scope.querySelectorAll(s));

  function esc(v) {
    return String(v ?? "")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  }

  function apiBase() {
    try {
      if (typeof CONFIG !== "undefined" && CONFIG?.API_SERVER) {
        return String(CONFIG.API_SERVER).replace(/\/$/,"");
      }
    } catch (_) {}
    return "https://api.gptyar.com";
  }

  function token() {
    try {
      return typeof PopupState !== "undefined" && PopupState?.token
        ? String(PopupState.token)
        : "";
    } catch (_) {
      return "";
    }
  }

  function resolveUrl(value, params={}) {
    let path = String(value || "").trim();
    if (!path) throw new Error("Endpoint تنظیم نشده است.");
    for (const [k,v] of Object.entries(params)) {
      path = path.split("{" + k + "}").join(encodeURIComponent(String(v ?? "")));
    }
    if (/^https:\/\//i.test(path)) return path;
    if (!path.startsWith("/")) path = "/" + path;
    return apiBase() + path;
  }

  async function adminRequest(endpoint, method="GET", body=null, params={}) {
    const headers = {Accept:"application/json"};
    const t = token();
    if (t) headers.Authorization = "Bearer " + t;
    if (body !== null && body !== undefined) headers["Content-Type"] = "application/json";

    const response = await fetch(resolveUrl(endpoint, params), {
      method,
      headers,
      cache:"no-store",
      body: body !== null && body !== undefined ? JSON.stringify(body) : undefined
    });

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }

    if (!response.ok) {
      const err = new Error("HTTP " + response.status + (text ? " - " + text.slice(0,400) : ""));
      err.status = response.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function activeTab() {
    return new Promise((resolve,reject) => {
      chrome.tabs.query({active:true,currentWindow:true}, tabs => {
        const err = chrome.runtime.lastError;
        if (err) return reject(new Error(err.message));
        const tab = tabs?.[0];
        if (!tab?.id) return reject(new Error("تب فعال پیدا نشد."));
        resolve(tab);
      });
    });
  }

  async function pageRequest(url, method="GET", body=null) {
    const tab = await activeTab();
    const tabUrl = String(tab.url || "");
    if (!/^https:\/\/([^.]+\.)?gptyar\.com\//i.test(tabUrl)) {
      throw new Error("ابتدا یکی از صفحات gptyar.com را در تب فعال باز کنید.");
    }

    const [{result}] = await chrome.scripting.executeScript({
      target:{tabId:tab.id},
      world:"MAIN",
      func: async (u,m,b) => {
        const r = await fetch(u, {
          method:m,
          credentials:"include",
          cache:"no-store",
          headers:{
            "Accept":"application/json",
            ...(b !== null ? {"Content-Type":"application/json"} : {})
          },
          body:b !== null ? JSON.stringify(b) : undefined
        });

        const text = await r.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
        return {ok:r.ok,status:r.status,data};
      },
      args:[url,method,body]
    });

    if (!result) throw new Error("پاسخی از تب فعال دریافت نشد.");
    if (!result.ok) {
      const detail = typeof result.data === "string"
        ? result.data
        : JSON.stringify(result.data ?? {});
      const err = new Error("HTTP " + result.status + (detail ? " - " + detail.slice(0,400) : ""));
      err.status = result.status;
      err.data = result.data;
      throw err;
    }
    return result.data;
  }

  function status(msg, kind="info") {
    const el = $("#commerceStatus", root);
    if (!el) return;
    el.className = "gyc-status " + kind;
    el.textContent = msg;
  }

  function raw(id, value) {
    const el = $("#" + id, root);
    if (!el) return;
    el.textContent = typeof value === "string" ? value : JSON.stringify(value,null,2);
  }

  function busy(btn, on, label="در حال انجام...") {
    if (!btn) return;
    if (on) {
      btn.dataset.oldText = btn.textContent;
      btn.disabled = true;
      btn.textContent = label;
    } else {
      btn.disabled = false;
      btn.textContent = btn.dataset.oldText || btn.textContent;
    }
  }

  function saveConfig() {
    $$("[data-api-key]", root).forEach(input => {
      cfg[input.dataset.apiKey] = input.value.trim();
    });
    chrome.storage.local.set({[STORE_KEY]:cfg}, () => {
      refreshAvailability();
      status("تنظیمات API ذخیره شد.","ok");
    });
  }

  function resetConfig() {
    cfg = {...DEFAULTS};
    chrome.storage.local.set({[STORE_KEY]:cfg}, () => {
      fillConfig();
      refreshAvailability();
      status("مسیرهای تأییدشده بازنشانی شدند.","ok");
    });
  }

  function fillConfig() {
    $$("[data-api-key]",root).forEach(input => {
      input.value = cfg[input.dataset.apiKey] || "";
    });
  }

  function refreshAvailability() {
    const map = {
      couponLoad:"couponList",
      couponCreate:"couponCreate",
      couponUpdate:"couponUpdate",
      couponDelete:"couponDelete",
      productLoad:"productList",
      priceUpdate:"productPriceUpdate"
    };
    for (const [id,key] of Object.entries(map)) {
      const btn = $("#" + id,root);
      if (btn) {
        btn.disabled = !String(cfg[key] || "").trim();
        btn.title = btn.disabled ? "Endpoint مدیریتی هنوز پیدا/تنظیم نشده است." : "";
      }
    }
  }

  async function validateDiscount(btn) {
    const code = $("#discountCheckCode",root).value.trim();
    if (!code) return status("کد تخفیف را وارد کنید.","bad");

    busy(btn,true,"بررسی...");
    try {
      const data = await pageRequest(resolveUrl(cfg.discountValidate), "POST", {code});
      raw("discountCheckRaw",data);
      status("پاسخ endpoint واقعی تخفیف دریافت شد.","ok");
    } catch (e) {
      raw("discountCheckRaw",e.data ?? e.message);
      if (e.status === 400) status("کد تخفیف توسط سرور رد شد.","bad");
      else status("بررسی کد ناموفق: " + e.message,"bad");
    } finally {
      busy(btn,false);
    }
  }

  async function readCart(btn) {
    busy(btn,true,"دریافت...");
    try {
      const data = await pageRequest(resolveUrl(cfg.cartRead),"GET",null);
      raw("cartRaw",data);
      status("سبد فعال از endpoint واقعی خوانده شد.","ok");
    } catch (e) {
      raw("cartRaw",e.data ?? e.message);
      status("خواندن سبد ناموفق: " + e.message,"bad");
    } finally {
      busy(btn,false);
    }
  }

  function listFrom(data, keys) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== "object") return [];
    for (const k of keys) if (Array.isArray(data[k])) return data[k];
    if (data.data && typeof data.data === "object") {
      if (Array.isArray(data.data)) return data.data;
      for (const k of keys) if (Array.isArray(data.data[k])) return data.data[k];
    }
    return [];
  }

  function couponId(x) {
    return x?.id || x?.couponId || x?.coupon_id || x?.uuid || x?.code || "";
  }

  function couponCode(x) {
    return x?.code || x?.coupon || x?.name || x?.title || "(بدون کد)";
  }

  function renderCoupons() {
    const list = $("#commerceCouponList",root);
    if (!list) return;
    if (!coupons.length) {
      list.innerHTML = '<div class="gyc-note">موردی دریافت نشده است.</div>';
      return;
    }
    list.innerHTML = coupons.map(x => {
      const id = couponId(x);
      const value = x.value ?? x.amount ?? x.percent ?? x.discount ?? "";
      const type = x.type ?? x.discountType ?? x.discount_type ?? "";
      return '<button type="button" class="gyc-row" data-id="' + esc(id) + '">' +
        '<b>' + esc(couponCode(x)) + '</b><span>' + esc(type) + " " + esc(value) + "</span></button>";
    }).join("");
    $$(".gyc-row",list).forEach(btn => btn.addEventListener("click",() => selectCoupon(btn.dataset.id)));
  }

  function selectCoupon(id) {
    const x = coupons.find(v => String(couponId(v)) === String(id));
    if (!x) return;
    $("#couponId",root).value = couponId(x);
    $("#couponCode",root).value = couponCode(x) === "(بدون کد)" ? "" : couponCode(x);
    $("#couponType",root).value = x.type || x.discountType || x.discount_type || "percent";
    $("#couponValue",root).value = x.value ?? x.amount ?? x.percent ?? x.discount ?? "";
    $("#couponMaxUses",root).value = x.maxUses ?? x.max_uses ?? x.usageLimit ?? "";
    $("#couponActive",root).checked = x.active !== false && x.enabled !== false;
  }

  function couponPayload() {
    const code = $("#couponCode",root).value.trim();
    const value = Number($("#couponValue",root).value);
    const maxRaw = $("#couponMaxUses",root).value.trim();

    if (!code) throw new Error("Code الزامی است.");
    if (!Number.isFinite(value) || value < 0) throw new Error("Value معتبر نیست.");
    const type = $("#couponType",root).value;
    if (type === "percent" && value > 100) throw new Error("درصد نمی‌تواند بیشتر از 100 باشد.");

    return {
      code,
      type,
      value,
      maxUses:maxRaw === "" ? null : Number(maxRaw),
      active:$("#couponActive",root).checked
    };
  }

  async function loadCoupons(btn) {
    busy(btn,true,"دریافت...");
    try {
      const data = await adminRequest(cfg.couponList,"GET");
      coupons = listFrom(data,["coupons","items","results"]);
      renderCoupons();
      raw("couponRaw",data);
      status("فهرست Coupon از API مدیریتی دریافت شد.","ok");
    } catch (e) {
      raw("couponRaw",e.data ?? e.message);
      status("خواندن Coupon ناموفق: " + e.message,"bad");
    } finally { busy(btn,false); }
  }

  async function createCoupon(btn) {
    try {
      if (!cfg.couponCreate) throw new Error("Endpoint ساخت Coupon هنوز تنظیم نشده است.");
      const payload = couponPayload();
      if (!confirm("کد تخفیف " + payload.code + " ساخته شود؟")) return;
      busy(btn,true,"ساخت...");
      const data = await adminRequest(cfg.couponCreate,"POST",payload);
      raw("couponRaw",data);
      status("درخواست ساخت Coupon موفق بود.","ok");
    } catch (e) {
      raw("couponRaw",e.data ?? e.message);
      status("ساخت Coupon ناموفق: " + e.message,"bad");
    } finally { busy(btn,false); }
  }

  async function updateCoupon(btn) {
    try {
      if (!cfg.couponUpdate) throw new Error("Endpoint ویرایش Coupon هنوز تنظیم نشده است.");
      const id = $("#couponId",root).value.trim();
      if (!id) throw new Error("ID الزامی است.");
      const payload = couponPayload();
      if (!confirm("Coupon " + id + " ویرایش شود؟")) return;
      busy(btn,true,"ویرایش...");
      const data = await adminRequest(cfg.couponUpdate,"PATCH",payload,{id});
      raw("couponRaw",data);
      status("درخواست ویرایش Coupon موفق بود.","ok");
    } catch (e) {
      raw("couponRaw",e.data ?? e.message);
      status("ویرایش Coupon ناموفق: " + e.message,"bad");
    } finally { busy(btn,false); }
  }

  async function deleteCoupon(btn) {
    try {
      if (!cfg.couponDelete) throw new Error("Endpoint حذف Coupon هنوز تنظیم نشده است.");
      const id = $("#couponId",root).value.trim();
      if (!id) throw new Error("ID الزامی است.");
      if (!confirm("Coupon " + id + " حذف شود؟")) return;
      busy(btn,true,"حذف...");
      const data = await adminRequest(cfg.couponDelete,"DELETE",null,{id});
      raw("couponRaw",data);
      status("درخواست حذف Coupon موفق بود.","ok");
    } catch (e) {
      raw("couponRaw",e.data ?? e.message);
      status("حذف Coupon ناموفق: " + e.message,"bad");
    } finally { busy(btn,false); }
  }

  async function loadProducts(btn) {
    busy(btn,true,"دریافت...");
    try {
      const data = await adminRequest(cfg.productList,"GET");
      raw("productRaw",data);
      status("Product Admin API پاسخ داد.","ok");
    } catch (e) {
      raw("productRaw",e.data ?? e.message);
      status("Product Admin API ناموفق: " + e.message,"bad");
    } finally { busy(btn,false); }
  }

  async function updatePrice(btn) {
    try {
      if (!cfg.productPriceUpdate) throw new Error("Endpoint مدیریتی تغییر قیمت هنوز تنظیم نشده است.");
      const id = $("#productId",root).value.trim();
      const price = Number($("#productPrice",root).value);
      if (!id) throw new Error("Product ID الزامی است.");
      if (!Number.isFinite(price) || price < 0) throw new Error("قیمت معتبر نیست.");

      const payload = {
        price,
        currency:$("#productCurrency",root).value.trim() || "IRR",
        variantId:$("#variantId",root).value.trim() || null,
        durationCode:$("#durationCode",root).value.trim() || null
      };

      if (!confirm("قیمت Catalog برای " + id + " تغییر کند؟")) return;
      busy(btn,true,"ثبت...");
      const data = await adminRequest(cfg.productPriceUpdate,"PATCH",payload,{id});
      raw("priceRaw",data);
      status("درخواست مدیریتی تغییر قیمت موفق بود.","ok");
    } catch (e) {
      raw("priceRaw",e.data ?? e.message);
      status("تغییر قیمت ناموفق: " + e.message,"bad");
    } finally { busy(btn,false); }
  }

  function injectStyle() {
    if ($("#commerceAdminStyle")) return;
    const s = document.createElement("style");
    s.id = "commerceAdminStyle";
    s.textContent =
      "#"+ROOT_ID+" *{box-sizing:border-box}" +
      ".gyc-backdrop{position:fixed;inset:0;z-index:2147483600;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:12px}" +
      ".gyc-backdrop[hidden]{display:none!important}" +
      ".gyc-modal{direction:rtl;width:min(390px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:hidden;background:#111827;color:#f8fafc;border:1px solid #334155;border-radius:14px;font-family:Vazirmatn,inherit;box-shadow:0 18px 45px rgba(0,0,0,.45)}" +
      ".gyc-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid #334155}.gyc-head b{font-size:14px}.gyc-close{width:32px!important;min-width:32px!important;height:32px!important;padding:0!important;flex:0 0 32px;border:0;border-radius:8px;background:#334155;color:#fff;cursor:pointer}" +
      ".gyc-status{margin:10px 12px 0;padding:8px 10px;border-radius:8px;background:#1e3a8a;font-size:11px}.gyc-status.ok{background:#065f46}.gyc-status.bad{background:#7f1d1d}" +
      ".gyc-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:10px 12px}.gyc-tab{width:auto!important;border:1px solid #334155;background:#1e293b;color:#cbd5e1;border-radius:8px;padding:8px;font:700 11px inherit;cursor:pointer}.gyc-tab.active{background:#334155;color:#fff}" +
      ".gyc-body{padding:12px;overflow:auto;max-height:calc(100dvh - 155px)}.gyc-pane{display:none}.gyc-pane.active{display:block}" +
      ".gyc-card{background:#0f172a;border:1px solid #273449;border-radius:12px;padding:11px;margin-bottom:10px}.gyc-card h3{font-size:12px;margin:0 0 8px}.gyc-note{font-size:10px;line-height:1.75;color:#94a3b8}.gyc-verified{color:#86efac}" +
      ".gyc-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.gyc-field{display:flex;flex-direction:column;gap:4px}.gyc-field label{font-size:10px;color:#a5b4fc}.gyc-field input,.gyc-field select{width:100%!important;border:1px solid #334155;background:#020617;color:#fff;border-radius:8px;padding:8px;font:11px inherit}.gyc-field input[type=checkbox]{width:auto!important}" +
      ".gyc-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}.gyc-btn{width:auto!important;flex:1 1 92px;min-width:0;border:0;border-radius:8px;padding:8px 10px;background:#334155;color:#fff;font:700 11px inherit;cursor:pointer}.gyc-btn.primary{background:#2563eb}.gyc-btn.success{background:#059669}.gyc-btn.danger{background:#dc2626}.gyc-btn.warn{background:#d97706}.gyc-btn:disabled{opacity:.38;cursor:not-allowed}" +
      ".gyc-list{display:flex;flex-direction:column;gap:6px;margin-top:9px}.gyc-row{width:100%!important;text-align:right;border:1px solid #334155;background:#020617;color:#fff;border-radius:8px;padding:8px;display:flex;justify-content:space-between;gap:8px;cursor:pointer}.gyc-row span{font-size:10px;color:#94a3b8}" +
      ".gyc-json{direction:ltr;text-align:left;white-space:pre-wrap;word-break:break-word;max-height:190px;overflow:auto;background:#020617;border:1px solid #263247;border-radius:8px;padding:8px;font:10px monospace;color:#cbd5e1}" +
      "@media(max-width:560px){.gyc-grid{grid-template-columns:1fr}}";
    document.head.appendChild(s);
  }

  function configFields() {
    const labels = {
      discountValidate:"discountValidate (verified)",
      cartRead:"cartRead (verified)",
      couponList:"couponList (admin unknown)",
      couponCreate:"couponCreate (admin unknown)",
      couponUpdate:"couponUpdate (admin unknown)",
      couponDelete:"couponDelete (admin unknown)",
      productList:"productList (admin unknown)",
      productPriceUpdate:"productPriceUpdate (admin unknown)"
    };
    return Object.keys(DEFAULTS).map(key =>
      '<div class="gyc-field"><label>' + esc(labels[key]) + '</label><input data-api-key="' + esc(key) + '"></div>'
    ).join("");
  }

  function renderRoot() {
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML =
      '<div class="gyc-backdrop" hidden><div class="gyc-modal">' +
      '<div class="gyc-head"><div><b>ابزار فروشگاه</b><div class="gyc-note">Verified storefront + optional Admin API</div></div><button class="gyc-close">×</button></div>' +
      '<div id="commerceStatus" class="gyc-status">آماده</div>' +
      '<div class="gyc-tabs"><button class="gyc-tab active" data-tab="coupon">تخفیف</button><button class="gyc-tab" data-tab="price">قیمت</button><button class="gyc-tab" data-tab="api">API</button></div>' +
      '<div class="gyc-body">' +

      '<section class="gyc-pane active" data-pane="coupon">' +
      '<div class="gyc-card"><h3>اعتبارسنجی کد تخفیف <span class="gyc-verified">✓ تأییدشده</span></h3>' +
      '<div class="gyc-note">Endpoint واقعی: POST /api/checkout/discount. این درخواست روی سبد فعال همان تب اجرا می‌شود.</div>' +
      '<div class="gyc-grid"><div class="gyc-field"><label>Code</label><input id="discountCheckCode" placeholder="مثلاً CODE"></div></div>' +
      '<div class="gyc-actions"><button id="discountCheck" class="gyc-btn success">بررسی کد</button></div><pre id="discountCheckRaw" class="gyc-json">—</pre></div>' +

      '<div class="gyc-card"><h3>مدیریت Coupon <span class="gyc-note">(Admin endpoint هنوز نامشخص)</span></h3>' +
      '<div class="gyc-actions"><button id="couponLoad" class="gyc-btn">فهرست</button></div><div id="commerceCouponList" class="gyc-list"><div class="gyc-note">برای فعال شدن، endpoint مدیریتی واقعی را در تب API وارد کنید.</div></div>' +
      '<div class="gyc-grid"><div class="gyc-field"><label>ID</label><input id="couponId"></div><div class="gyc-field"><label>Code</label><input id="couponCode"></div>' +
      '<div class="gyc-field"><label>Type</label><select id="couponType"><option value="percent">percent</option><option value="fixed">fixed</option></select></div><div class="gyc-field"><label>Value</label><input id="couponValue" type="number" min="0"></div>' +
      '<div class="gyc-field"><label>Max uses</label><input id="couponMaxUses" type="number" min="0"></div><div class="gyc-field"><label>Active</label><label><input id="couponActive" type="checkbox" checked> فعال</label></div></div>' +
      '<div class="gyc-actions"><button id="couponCreate" class="gyc-btn success">ساخت</button><button id="couponUpdate" class="gyc-btn primary">ویرایش</button><button id="couponDelete" class="gyc-btn danger">حذف</button></div>' +
      '<pre id="couponRaw" class="gyc-json">—</pre></div></section>' +

      '<section class="gyc-pane" data-pane="price">' +
      '<div class="gyc-card"><h3>سبد فعال <span class="gyc-verified">✓ تأییدشده</span></h3><div class="gyc-note">GET /api/cart فقط وضعیت واقعی سبد و قیمت محاسبه‌شده توسط سرور را نمایش می‌دهد.</div>' +
      '<div class="gyc-actions"><button id="cartLoad" class="gyc-btn success">خواندن سبد</button></div><pre id="cartRaw" class="gyc-json">—</pre></div>' +
      '<div class="gyc-card"><h3>Product / Price Admin <span class="gyc-note">(endpoint هنوز نامشخص)</span></h3><div class="gyc-actions"><button id="productLoad" class="gyc-btn">دریافت محصولات</button></div><pre id="productRaw" class="gyc-json">—</pre>' +
      '<div class="gyc-grid"><div class="gyc-field"><label>Product ID</label><input id="productId"></div><div class="gyc-field"><label>Variant ID</label><input id="variantId"></div><div class="gyc-field"><label>Duration</label><input id="durationCode" placeholder="1m"></div><div class="gyc-field"><label>Currency</label><input id="productCurrency" value="IRR"></div><div class="gyc-field"><label>Price</label><input id="productPrice" type="number" min="0"></div></div>' +
      '<div class="gyc-actions"><button id="priceUpdate" class="gyc-btn warn">ثبت قیمت مدیریتی</button></div><pre id="priceRaw" class="gyc-json">—</pre></div></section>' +

      '<section class="gyc-pane" data-pane="api"><div class="gyc-card"><h3>Endpointها</h3><div class="gyc-note">دو endpoint اول از Capture واقعی تأیید شده‌اند. بقیه عمداً خالی هستند تا درخواست 404 یا حدسی ارسال نشود.</div><div class="gyc-grid">' +
      configFields() +
      '</div><div class="gyc-actions"><button id="apiSave" class="gyc-btn primary">ذخیره</button><button id="apiReset" class="gyc-btn">بازنشانی</button></div></div></section>' +

      '</div></div></div>';

    document.body.appendChild(root);

    $(".gyc-close",root).addEventListener("click",close);
    $(".gyc-backdrop",root).addEventListener("click",e => {
      if (e.target.classList.contains("gyc-backdrop")) close();
    });

    $$(".gyc-tab",root).forEach(tab => tab.addEventListener("click",() => {
      $$(".gyc-tab",root).forEach(x => x.classList.toggle("active",x===tab));
      $$(".gyc-pane",root).forEach(x => x.classList.toggle("active",x.dataset.pane===tab.dataset.tab));
    }));

    $("#discountCheck",root).addEventListener("click",e => validateDiscount(e.currentTarget));
    $("#cartLoad",root).addEventListener("click",e => readCart(e.currentTarget));
    $("#couponLoad",root).addEventListener("click",e => loadCoupons(e.currentTarget));
    $("#couponCreate",root).addEventListener("click",e => createCoupon(e.currentTarget));
    $("#couponUpdate",root).addEventListener("click",e => updateCoupon(e.currentTarget));
    $("#couponDelete",root).addEventListener("click",e => deleteCoupon(e.currentTarget));
    $("#productLoad",root).addEventListener("click",e => loadProducts(e.currentTarget));
    $("#priceUpdate",root).addEventListener("click",e => updatePrice(e.currentTarget));
    $("#apiSave",root).addEventListener("click",saveConfig);
    $("#apiReset",root).addEventListener("click",resetConfig);
  }

  function open() {
    fillConfig();
    refreshAvailability();
    $(".gyc-backdrop",root).hidden = false;
  }

  function close() {
    $(".gyc-backdrop",root).hidden = true;
  }

  function ensureToolsHost() {
    const section = $("#accupdator-section");
    if (!section) return null;
    const content = $(".accupdator-content",section) || $("#accupdatorPanel",section);
    if (!content) return null;

    let card = $("#gptyarCommerceToolsCard",section);
    if (!card) {
      card = document.createElement("div");
      card.id = "gptyarCommerceToolsCard";
      card.className = "accupdator-section-card";
      card.innerHTML =
        '<div class="section-card-header"><span>ابزارهای فروشگاه</span></div>' +
        '<div class="section-card-content"><div id="gptyarCommerceToolsButtons" class="accupdator-buttons"></div></div>';
      content.appendChild(card);
    }
    return $("#gptyarCommerceToolsButtons",card);
  }

  function ensureButton() {
    const target = ensureToolsHost();
    if (!target) return;

    let btn = $("#" + BTN_ID);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.type = "button";
      btn.className = "accupdator-btn secondary-btn";
      btn.textContent = "تخفیف و قیمت";
      btn.addEventListener("click",open);
    }
    if (btn.parentElement !== target) target.appendChild(btn);
  }

  function init() {
    injectStyle();
    chrome.storage.local.get([STORE_KEY],result => {
      cfg = {...DEFAULTS,...(result?.[STORE_KEY] || {})};
      renderRoot();
      fillConfig();
      refreshAvailability();
      ensureButton();
      new MutationObserver(ensureButton).observe(document.documentElement,{childList:true,subtree:true});
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded",init,{once:true});
  } else {
    init();
  }
})();