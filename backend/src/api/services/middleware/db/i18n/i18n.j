const tr = require('./tr/messages.json');
const de = require('./de/messages.json');

const DICTS = { tr, de };

module.exports = function i18n(lang, key) {
  if (DICTS[lang] && DICTS[lang][key]) return DICTS[lang][key];
  return DICTS['tr'][key] || key;
};