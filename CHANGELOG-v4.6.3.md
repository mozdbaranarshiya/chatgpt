# GPT Yar v4.6.3 — Commerce Admin

This update adds an authenticated admin panel for coupon management and catalog-price management, plus a passive API-discovery tool for finding the backend routes actually used by the GPTYAR web application.

## What changed

- Adds a new **مدیریت تخفیف و قیمت** button to the Accupdator interface.
- Adds coupon list/create/update/delete UI.
- Adds catalog product lookup and backend-authorized price update UI.
- Adds configurable endpoint templates in the extension UI.
- Adds capability probing so unsupported backend routes are reported instead of silently failing.
- Adds **کشف API فروشگاه**:
  - observes `fetch` and `XMLHttpRequest` calls only on `gptyar.com` / subdomains;
  - records method, URL, status, duration and sanitized request/response previews;
  - highlights requests related to coupon, discount, product, price, cart, checkout, order and payment;
  - redacts tokens, cookies, passwords, OTP/MFA, phone numbers and emails;
  - never blocks, changes or replays a request.
- Requires explicit confirmation before write/delete operations.
- Does **not** tamper with client-side checkout totals.

## Default backend contract

The original v4.6.2 extension did not expose coupon/product admin endpoints, so the admin panel still contains configurable placeholder defaults:

```text
GET    /accupdator/coupons
POST   /accupdator/coupons
PATCH  /accupdator/coupons/{id}
DELETE /accupdator/coupons/{id}
GET    /accupdator/products
PATCH  /accupdator/products/{id}/price
```

The API-discovery tool is intended to identify the real routes used by the existing management/web application. Once identified, those routes can be entered in the **API** tab.

## Build

```bash
python scripts/build_v463.py
```

GitHub Actions builds `v4.6.3-commerce-admin.zip` and validates both injected JavaScript files with `node --check`.
