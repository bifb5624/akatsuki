export function addMonths(value, months) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '') || !Number.isInteger(months) || months < 0) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString().slice(0, 10);
}
export function nextDate(asset) {
  if (!Number.isInteger(asset.months) || asset.months <= 0) return null;
  const latest = asset.history.map(item => item.date).sort().at(-1) || asset.installed;
  return addMonths(latest, asset.months);
}
export function inPeriod(date, period, today) {
  if (period === 'all') return true;
  if (!date) return period === 'unknown';
  if (period === 'overdue') return date < today;
  if (period === 'month') return date.slice(0, 7) === today.slice(0, 7);
  if (period === 'year') return date.slice(0, 4) === today.slice(0, 4);
  if (period === 'six') return date >= today && date <= addMonths(today, 6);
  return false;
}
export function japanToday() {
  return new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Tokyo', year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
