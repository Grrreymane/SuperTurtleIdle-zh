#!/usr/bin/env python3
"""Subset Noto Sans SC (OFL) to the characters in i18n/zh.json -> font/zh.woff2. Rerun after changing translations.

    python tools/i18n/font.py

Pins the variable font to Medium, so one small file serves all text. Needs: pip install fonttools brotli
"""
import json, pathlib, shutil
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = pathlib.Path('D:/Minigame/_workflow/fonts/free/NotoSansSC[wght].ttf')
LICENSE = SRC.parent / 'OFL.txt'

chars = set('中文语言')
for zh in json.loads((ROOT / 'i18n' / 'zh.json').read_text(encoding='utf-8')).values():
    chars.update(zh)
# Only CJK and CJK punctuation: Latin, digits and emoji stay with the game's fonts and the system.
def is_cjk(c):
    o = ord(c)
    return 0x2E80 <= o <= 0x9FFF or 0xF900 <= o <= 0xFAFF or 0xFE30 <= o <= 0xFE4F or 0xFF00 <= o <= 0xFFEF or c in '‘’“”…'
wanted = {c for c in chars if is_cjk(c)}

font = TTFont(SRC)
font = instancer.instantiateVariableFont(font, {'wght': 500})
opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = ['*']
opts.name_IDs = ['*']
opts.notdef_outline = True
sub = subset.Subsetter(opts)
sub.populate(unicodes=[ord(c) for c in wanted])
sub.subset(font)
out = ROOT / 'font' / 'zh.woff2'
font.flavor = 'woff2'
font.save(out)
shutil.copyfile(LICENSE, ROOT / 'font' / 'OFL-NotoSansSC.txt')
# The upstream body font, Belwe Light BT, is a commercial Bitstream typeface that CC0 can't cover.
# This repo ships an OFL serif under the same CSS family name instead (Latin part of Noto Serif SC).
serif = instancer.instantiateVariableFont(TTFont(SRC.parent / 'NotoSerifSC[wght].ttf'), {'wght': 400})
latin = list(range(0x20, 0x7F)) + list(range(0xA0, 0x180)) + list(range(0x2010, 0x2028)) + list(range(0x2030, 0x205F)) + [0x20AC, 0x2122]
sub = subset.Subsetter(opts)
sub.populate(unicodes=latin)
sub.subset(serif)
serif.flavor = 'woff2'
serif.save(ROOT / 'font' / 'body-serif.woff2')
print(f"body-serif.woff2 {(ROOT / 'font' / 'body-serif.woff2').stat().st_size // 1024} KB")

cmap = TTFont(out).getBestCmap()
missing = [c for c in wanted if ord(c) not in cmap]
print(f'{len(wanted)} characters, {out.stat().st_size // 1024} KB, not in font: {len(missing)}')
print(ascii(''.join(missing)))
