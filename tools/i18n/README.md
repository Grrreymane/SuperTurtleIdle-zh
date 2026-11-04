# Translation tools

The game's English is the source language. Game logic never sees a translation: AIWANNA's `/sdk/auto-i18n-v1.js`
swaps text nodes on screen, and `i18n/config.js` configures it. The only game code touched is the item search and
the mail preview in `rpg.js`, which need the Chinese text themselves.

    npm install --prefix tools acorn     # once
    node tools/i18n/extract.cjs          # English phrases from the source -> i18n/_work/phrases.json
    node tools/i18n/build.cjs --missing  # dictionary + upload files; lists anything untranslated
    python tools/i18n/font.py            # Chinese font subset, after the dictionary changes
    node tools/i18n/harvest.cjs          # English still on screen in Chinese mode -> i18n/_work/misses.json
    node tools/i18n/misses_report.cjs    # the same list, minus internal fields and supporter names
    node tools/i18n/verify.cjs           # end-to-end checks and screenshots
    node tools/i18n/shots.cjs            # tooltip, settings and first-run screenshots
    node tools/i18n/online.cjs           # the live game and its AIWANNA page, in both languages

To change a translation or add a line: edit `i18n/_work/extra.json` (English -> Chinese, `null` for text that is
not shown), rebuild, and rerun `font.py` if there are new characters. `i18n/_work/glossary.md` holds the terms.
Push, then upload `i18n/phrases/` with the MCP's `upload_game_text` (`use: "phrases"`, original `en`, translation `zh`).
Lines edited on AIWANNA stay as edited.

AIWANNA takes at most 2000 entries and 400,000 bytes per language file, so `i18n/phrases/` holds the entries seen most
and `i18n/zh.js` holds them all. Both are used at runtime, and edits made on AIWANNA win.

Text inside images (such as `img/src/gametips/`) stays in English.
