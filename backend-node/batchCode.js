// Production batch code: H/DD/MM/YY/HH/mm in factory local time, e.g.
// H/10/10/26/21/29 for a harvest saved 10 Oct 2026 at 21:29. The container
// clock runs in UTC, so the zone is applied explicitly.
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Jakarta';

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TIMEZONE,
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function batchCode(date) {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(date)).map((p) => [p.type, p.value]));
  return `H/${parts.day}/${parts.month}/${parts.year}/${parts.hour}/${parts.minute}`;
}

const PRODUCTION_SOURCES = ['harvest', 'repack'];

module.exports = { batchCode, PRODUCTION_SOURCES, APP_TIMEZONE };
