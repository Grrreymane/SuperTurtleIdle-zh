# Super Turtle Idle: Chinese edition

[Super Turtle Idle](https://superturtleidle.github.io/) is an incremental idle RPG made by "duck" [drvcx], with the turtle voiced by "lily" [.lilynee]. The original game is released under CC0 1.0 (`LICENSE.txt`). All credit for the game goes to them. If you like it, support them through the game's Patreon, Ko-fi and Discord links.

This copy adds Simplified Chinese. English stays available and is the default outside Chinese browsers: use **Settings > Language** or `?lang=en` / `?lang=zh`.

Changes from the original:

- Translation through AIWANNA's `auto-i18n` script. The game's code is otherwise unchanged. See `tools/i18n/README.md`.
- Item search also matches Chinese names, and mail previews are shortened after translation.
- Asset paths are relative so that the game can run from a subfolder.
- The body font is an open-license replacement, see `font/LICENSES.md`.
- Unused artwork source files are removed.
- Inside the AIWANNA player: cloud saves and a Total Mastery leaderboard, see `platform/online.js`. Opened on its own, the game has neither and keeps its save in the browser, as the original does. `node tools/online_sim.cjs` tests this against a pretend platform.

Text inside images stays in English.

# 超级乌龟放置（中文版）

原作 [Super Turtle Idle](https://superturtleidle.github.io/) 由 "duck" [drvcx] 制作，乌龟配音 "lily" [.lilynee]，以 CC0 1.0 协议发布。本版只加了简体中文，英文仍可在「设置 > 语言」切换。喜欢这个游戏的话，请通过游戏里的 Patreon、Ko-fi、Discord 链接支持原作者。
