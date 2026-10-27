/**
 * Utility for calculating the operational date in Asia/Kolkata (IST).
 * 
 * Plant operations follow an operational day starting at 06:00 IST and ending at 05:59 IST next morning:
 * - 06:00 to 23:59 IST: belongs to current calendar date (D).
 * - 00:00 to 05:59 IST: belongs to previous calendar date (D-1).
 * 
 * Previous date is computed strictly from the IST date components (year, month, day)
 * using UTC calendar date arithmetic (Date.UTC(y, m - 1, d - 1)) to prevent any UTC/timezone drift.
 */

function getOperatingDateIST(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
  });
  const parts = formatter.formatToParts(d);
  const getPart = (type) => parts.find((p) => p.type === type)?.value;

  const year = parseInt(getPart('year'), 10);
  const month = parseInt(getPart('month'), 10); // 1-12
  const day = parseInt(getPart('day'), 10);
  const hour = parseInt(getPart('hour'), 10);

  if (hour < 6) {
    const prevDate = new Date(Date.UTC(year, month - 1, day - 1));
    const py = prevDate.getUTCFullYear();
    const pm = String(prevDate.getUTCMonth() + 1).padStart(2, '0');
    const pd = String(prevDate.getUTCDate()).padStart(2, '0');
    return `${py}-${pm}-${pd}`;
  }

  const yStr = String(year);
  const mStr = String(month).padStart(2, '0');
  const dStr = String(day).padStart(2, '0');
  return `${yStr}-${mStr}-${dStr}`;
}

module.exports = {
  getOperatingDateIST,
};
