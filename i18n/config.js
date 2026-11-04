// AIWANNA in-game translation, "by source text" mode (see aiwanna.games/developer/docs/publishing#source-phrases).
// The game's English stays the source language and its code is untouched: /sdk/auto-i18n-v1.js swaps text nodes
// on screen. Language order: ?lang= from the site, then the player's choice, then the browser, then English.
window.GameLocalization = {
  id: 'super-turtle-idle',
  sourceLocale: 'en',
  languages: { en: 'English', zh: '中文' },
  // Bundled so that translation works if the site's dictionary can't be reached and past its 2000-entry limit.
  translations: { zh: window.STI_ZH || {} },
  // Dictionary edits made on AIWANNA are layered on top of the bundled one.
  remote: { origin: 'https://www.aiwanna.games', game: 'game-59113b06fffd7876' },
  switcherSelector: '#gameLanguage',
  canvas2d: false, // the game draws all text in the DOM
};
