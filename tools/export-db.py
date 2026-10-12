#!/usr/bin/env python3
"""성분 기준 DB(SQLite)를 웹에서 쓰는 JSON으로 내보낸다.

원본: caution_cosmetic/cosmetic_file.db (영문명·좋은 성분까지 들어 있는 최신본)
결과: web/data/ingredients.json

    python3 tools/export-db.py
"""
import json
import pathlib
import sqlite3

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "caution_cosmetic" / "cosmetic_file.db"
OUT = ROOT / "web" / "data" / "ingredients.json"

TABLES = {
    "caution": "caution_ingredients_table",
    "allergy": "allergy_ingredients_table",
    "good": "good_ingredients_table",
}


def main():
    con = sqlite3.connect(SRC)
    data = {}
    for key, table in TABLES.items():
        rows = con.execute(f'SELECT name, comment, english FROM "{table}" ORDER BY name')
        data[key] = [
            {"name": (n or "").strip(), "comment": (c or "").strip(), "english": (e or "").strip()}
            for n, c, e in rows
            if n and n.strip()
        ]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=0), encoding="utf-8")
    print(OUT.relative_to(ROOT), {k: len(v) for k, v in data.items()})


if __name__ == "__main__":
    main()
