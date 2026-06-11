// Soumet les URLs du sitemap à IndexNow (Bing, Yandex) pour indexation instantanée.
// Usage: node scripts/submit-indexnow.mjs

const HOST = 'dubainvest.eu';
const KEY = 'f953f28c7aef4bdb8c0b504e8fa90924';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

const urlList = [
  `https://${HOST}/`,
  `https://${HOST}/analyse-geopolitique-dubai`,
  `https://${HOST}/guide-visa-or-dubai`,
  `https://${HOST}/meilleurs-quartiers-dubai-investissement`,
];

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList,
  }),
});

console.log(`[indexnow] status ${res.status}`);
console.log(await res.text());
