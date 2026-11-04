// In-game translation through AIWANNA's /sdk/auto-i18n-v1.js, which swaps text nodes on screen. The game's English
// is the source language and game logic never sees a translation. The whole dictionary ships with the game, so the
// site stores no text for it and has nothing to scan or machine-translate.
//
// Language: the site's ?lang= decides, so an English site opens English and a Chinese site opens Chinese. Opened
// without ?lang=, it's the player's last choice, then the browser, then English.

// A site language this game doesn't have opens English, whatever the browser's language is.
(function () {
  try {
    const url = new URL(location.href);
    const asked = url.searchParams.get('lang');
    if (asked && !/^(en|zh)(-|$)/i.test(asked)) {
      url.searchParams.set('lang', 'en');
      history.replaceState(history.state, '', url);
    }
  } catch (e) { /* Never let this stop the game. */ }
})();

window.GameLocalization = {
  id: 'super-turtle-idle',
  sourceLocale: 'en',
  languages: { en: 'English', zh: '中文' },
  translations: { zh: window.STI_ZH || {} },
  switcherSelector: '#gameLanguage',
  canvas2d: false, // the game draws all text in the DOM
};
