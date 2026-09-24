# v4.6.3 patch source

`commerce-admin.js` is stored as numbered Base64 chunks in this directory so the repository can keep the original v4.6.2 ZIP untouched while GitHub Actions rebuilds the upgraded extension.

The build script concatenates the files in lexical order, decodes them, injects the script into the extension, bumps the manifest/package version to 4.6.3, and creates `v4.6.3-commerce-admin.zip`.

The commerce panel only calls authenticated administrative backend endpoints. It does not override checkout totals in the browser.
