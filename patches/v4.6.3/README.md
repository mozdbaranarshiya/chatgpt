# v4.6.3 patch source

This directory contains the readable source patch used to build the upgraded extension.

- `commerce-admin.js` adds the authenticated **مدیریت تخفیف و قیمت** panel.
- `scripts/build_v463.py` extracts the repository's existing `v4.6.2.zip`, injects this script, bumps the extension version to 4.6.3, and produces `v4.6.3-commerce-admin.zip`.
- The GitHub Actions workflow validates the injected JavaScript with `node --check` before committing the generated ZIP.

The commerce panel only calls authenticated administrative backend endpoints. It does not override checkout totals in the browser.
