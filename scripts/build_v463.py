#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_ZIP = ROOT / "v4.6.2.zip"
PATCH_JS = ROOT / "patches" / "v4.6.3" / "commerce-admin.js"
OUTPUT_ZIP = ROOT / "v4.6.3-commerce-admin.zip"


def patch_json(path: Path) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    data["version"] = "4.6.3"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    if not SOURCE_ZIP.exists():
        raise FileNotFoundError(SOURCE_ZIP)
    if not PATCH_JS.exists():
        raise FileNotFoundError(PATCH_JS)

    with tempfile.TemporaryDirectory(prefix="gptyar-v463-") as tmp_name:
        tmp = Path(tmp_name)
        extracted = tmp / "extracted"
        extracted.mkdir()

        with zipfile.ZipFile(SOURCE_ZIP, "r") as source:
            source.extractall(extracted)

        roots = [p for p in extracted.iterdir() if p.is_dir()]
        if len(roots) != 1:
            raise RuntimeError(f"Expected exactly one extension root, found {roots}")

        source_root = roots[0]
        extension_root = tmp / "v4.6.3"
        shutil.copytree(source_root, extension_root)

        shutil.copy2(PATCH_JS, extension_root / "commerce-admin.js")
        patch_json(extension_root / "manifest.json")
        patch_json(extension_root / "package.json")

        popup = extension_root / "popup.html"
        html = popup.read_text(encoding="utf-8")
        script_tag = '  <script src="commerce-admin.js"></script>\n'
        if "commerce-admin.js" not in html:
            anchor = '  <script src="support-manager.js"></script>\n'
            if anchor not in html:
                raise RuntimeError("support-manager.js anchor not found in popup.html")
            html = html.replace(
                anchor,
                anchor + '  <!-- Commerce admin: authenticated coupon/catalog management -->\n' + script_tag,
                1,
            )
        popup.write_text(html, encoding="utf-8")

        if OUTPUT_ZIP.exists():
            OUTPUT_ZIP.unlink()

        with zipfile.ZipFile(OUTPUT_ZIP, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as target:
            for path in sorted(extension_root.rglob("*")):
                if path.is_file():
                    target.write(path, Path("v4.6.3") / path.relative_to(extension_root))

    print(f"Built {OUTPUT_ZIP}")


if __name__ == "__main__":
    main()
