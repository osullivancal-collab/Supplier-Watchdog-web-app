// Words for a dot on the dot chart: what period it is and what's in it.
import { dateFromOffset, dayLabel, monthName } from './format.js';

const short = (off) => { const d = dateFromOffset(off); return `${d.getDate()} ${monthName(d.getMonth())}`; };

export function bucketDescriber(unit, nameOf) {
  return (b, kind, isLatest) => {
    if (!b) return { title: '', short: '', sub: '' };
    if (kind === 'past') {
      const d = dateFromOffset(b.from);
      const title = unit === 'day' ? dayLabel(b.from)
        : unit === 'week' ? (isLatest ? 'Last 7 days' : `Week of ${short(b.from)}`)
        : (isLatest ? `${monthName(d.getMonth())} so far` : `${monthName(d.getMonth())} ${d.getFullYear()}`);
      const sub = b.count ? `${b.count} bill${b.count === 1 ? '' : 's'} · ${nameOf(b.top)} biggest` : 'No bills';
      const yr = d.getFullYear() !== new Date().getFullYear() ? ` '${String(d.getFullYear()).slice(2)}` : '';
      return { title, short: unit === 'month' ? monthName(d.getMonth()) + yr : short(b.from), sub };
    }
    const d = dateFromOffset(b.from);
    const title = unit === 'day' ? `Due ${dayLabel(b.from)}`
      : unit === 'week' ? `Due week of ${short(b.from)}`
      : (b.from <= 1 && d.getMonth() === new Date().getMonth() ? `Due rest of ${monthName(d.getMonth())}` : `Due in ${monthName(d.getMonth())}`);
    const names = [...new Set(b.bills.map((x) => nameOf(x.supplierId || x.vendor)))];
    return {
      title,
      short: unit === 'day' ? '+10 days' : unit === 'week' ? '+5 wks' : monthName(d.getMonth()),
      sub: names.length ? names.slice(0, 3).join(', ') : 'Nothing due',
    };
  };
}

export const greeting = (now = new Date()) => (now.getHours() < 12 ? 'Morning' : now.getHours() < 17 ? 'Arvo' : 'Evening');
