"""Export the Unihan fields the level builder needs into one JSON file.

Input : unihan.db from the npm package cjk-unihan (data/unihan.db).
Output: unihan.json  {char: {kHKGlyph, kGradeLevel, kCantonese, kMandarin, ...}}

Usage: python3 -I export_unihan.py <path/to/unihan.db> <out/unihan.json>
"""
import json
import sqlite3
import sys

COLS = ['character', 'kGradeLevel', 'kFrequency', 'kCantonese', 'kMandarin',
        'kSimplifiedVariant', 'kTraditionalVariant', 'kTotalStrokes',
        'kBigFive', 'kHKGlyph', 'kDefinition', 'kSemanticVariant', 'kZVariant',
        'kSpecializedSemanticVariant']

db = sqlite3.connect('file:' + sys.argv[1] + '?mode=ro', uri=True)
out = {}
for row in db.execute('select %s from unihan' % ','.join(COLS)):
    d = dict(zip(COLS, row))
    ch = d.pop('character')
    if len(ch) == 1:
        out[ch] = {k: v for k, v in d.items() if v}
with open(sys.argv[2], 'w', encoding='utf8') as f:
    json.dump(out, f, ensure_ascii=False)
print(len(out), 'chars written')
