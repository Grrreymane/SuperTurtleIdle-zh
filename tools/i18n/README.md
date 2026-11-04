# Translation tools

The game's English is the source language. Game logic never sees a translation: AIWANNA's `/sdk/auto-i18n-v1.js`
swaps text nodes on screen, and `i18n/config.js` configures it. The only game code touched is the item search and
the mail preview in `rpg.js`, which need the Chinese text themselves.

    npm install --prefix tools acorn     # once
    node tools/i18n/extract.cjs          # English phrases from the source -> i18n/_work/phrases.json
    node tools/i18n/build.cjs --missing  # dictionary for the game; lists anything untranslated
    python tools/i18n/font.py            # Chinese font subset, after the dictionary changes
    node tools/i18n/harvest.cjs          # English still on screen in Chinese mode -> i18n/_work/misses.json
    node tools/i18n/misses_report.cjs    # the same list, minus internal fields and supporter names
    node tools/i18n/verify.cjs           # end-to-end checks and screenshots
    node tools/i18n/shots.cjs            # tooltip, settings and first-run screenshots
    node tools/i18n/online.cjs           # which language opens: --local for this copy, otherwise the live game and its AIWANNA page

To change a translation or add a line: edit `i18n/_work/extra.json` (English -> Chinese, `null` for text that is
not shown), rebuild, rerun `font.py` if there are new characters, and push. `i18n/_work/glossary.md` holds the terms.

The translation is deliberately not uploaded to AIWANNA as a language file. A file there is limited to 2000 entries and
this game has about 3800. Worse, an uploaded English original makes the site machine-translate every site language and
read the whole file every five minutes, for languages this game doesn't offer. The game page instead declares `en` and
`zh` with `set_game_details`, and the platform's phrase dictionary for this game is deliberately empty.

Text inside images (such as `img/src/gametips/`) stays in English.
