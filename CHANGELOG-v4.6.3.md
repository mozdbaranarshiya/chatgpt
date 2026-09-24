# GPT Yar v4.6.3 — Commerce Admin

This update adds an authenticated admin panel for coupon management and catalog-price management.

## What changed

- Adds a new **مدیریت تخفیف و قیمت** button to the Accupdator interface.
- Adds coupon list/create/update/delete UI.
- Adds catalog product lookup and backend-authorized price update UI.
- Adds configurable endpoint templates in the extension UI.
- Adds capability probing so unsupported backend routes are reported instead of silently failing.
- Shows raw backend responses to make API-contract debugging easier.
- Requires explicit confirmation before write/delete operations.
- Does **not** tamper with client-side checkout totals.

## Default backend contract

The original v4.6.2 extension did not expose coupon/product admin endpoints, so the new panel defaults to a proposed, configurable contract:

```text
GET    /accupdator/coupons
POST   /accupdator/coupons
PATCH  /accupdator/coupons/{id}
DELETE /accupdator/coupons/{id}
GET    /accupdator/products
PATCH  /accupdator/products/{id}/price
```

If the backend uses different routes, open the **API** tab in the new panel and change the paths.

## Build

```bash
python scripts/build_v463.py
```

The GitHub Actions workflow also builds and commits `v4.6.3-commerce-admin.zip` on this feature branch.
