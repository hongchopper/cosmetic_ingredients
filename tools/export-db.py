#!/usr/bin/env python3
"""성분 기준 DB(SQLite)를 웹에서 쓰는 JSON으로 내보낸다.

내보내면서 설명 글과 이름으로 묶음(tags)을 붙이고, 좋은 성분 설명에 섞여 있는
피부 타입 안내("건성피부에 좋아요", "민감성피부는 피하세요")를 skin 필드로 뺀다.

원본: caution_cosmetic/cosmetic_file.db (영문명·좋은 성분까지 들어 있는 최신본)
결과: web/data/ingredients.json

    python3 tools/export-db.py
"""
import json
import pathlib
import re
import sqlite3

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "caution_cosmetic" / "cosmetic_file.db"
OUT = ROOT / "web" / "data" / "ingredients.json"

TABLES = {
    "caution": "caution_ingredients_table",
    "allergy": "allergy_ingredients_table",
    "good": "good_ingredients_table",
}


# 주의 성분 묶음: (태그, 이름 또는 설명에 들어 있는 말). 위에서부터 처음 맞는 것 하나.
CAUTION_GROUPS = [
# (방부제를 파라벤보다 먼저 본다: 페녹시에탄올 설명에 "파라벤과 함께"라는 말이 있다)
    ("tar", ["타르색소"]),
    ("preservative", ["포름알데히드", "포름알데하이드", "방부제", "소르빈산", "소르빅애씨드", "트리클로산", "이미다졸리디닐"]),
    ("paraben", ["파라벤"]),
    ("fragrance", ["향료로 표기"]),
    ("peg", ["피이지", "피피지", "폴리옥실", "섭취시 간장,신장"]),
    ("sulfate", ["설페이트", "황산염"]),
    ("antioxidant", ["하이드록시톨루엔", "비에이치티", "비에이치에이", "하이드록시아니솔"]),
    ("sunscreen", ["햇볕과 만나면", "벤조페논", "옥시벤존"]),
]

GOOD_TAGS = [("uv", "자외선 차단"), ("whitening", "미백"), ("wrinkle", "주름 개선")]
SKIN = {"건성": "dry", "지성": "oily", "민감성": "sensitive"}
SKIN_LINE = re.compile(r"^(건성|지성|민감성)\s*피부(에 좋아요|는 피하세요)")


def caution_tags(name, comment):
    text = name + " " + comment
    for tag, words in CAUTION_GROUPS:
        if any(w in text for w in words):
            return [tag]
    return ["etc"]


def good_info(comment):
    tags = [tag for tag, word in GOOD_TAGS if word in comment]
    skin = {"good": [], "avoid": []}
    rest = []
    for line in comment.splitlines():
        line = line.strip()
        m = SKIN_LINE.match(line)
        if m:
            kind = "good" if "좋아요" in m.group(2) else "avoid"
            skin[kind].append(SKIN[m.group(1)])
            extra = re.search(r"\((.+)\)", line)  # 예: 지성피부에 좋아요.(살균 및 항염)
            if extra:
                rest.append(extra.group(1) + "에 도움이 돼요.")
        elif line:
            rest.append(line)
    return tags, skin, "\n".join(rest)


def main():
    con = sqlite3.connect(SRC)
    data = {}
    for key, table in TABLES.items():
        rows = con.execute(f'SELECT name, comment, english FROM "{table}" ORDER BY name')
        out = []
        for n, c, e in rows:
            name, comment, english = (n or "").strip(), (c or "").strip(), (e or "").strip()
            if not name:
                continue
            row = {"name": name, "comment": comment, "english": english}
            if key == "caution":
                row["tags"] = caution_tags(name, comment)
            elif key == "allergy":
                row["tags"] = ["allergen"]
            else:
                row["tags"], row["skin"], row["comment"] = good_info(comment)
            out.append(row)
        data[key] = out
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=0), encoding="utf-8")
    print(OUT.relative_to(ROOT), {k: len(v) for k, v in data.items()})


if __name__ == "__main__":
    main()
