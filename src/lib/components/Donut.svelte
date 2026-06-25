<script>
  import { fmt0 } from '$lib/format.js';
  let { items = [] } = $props();

  const COLORS = ['#1A3F52','#1B6B5A','#F59E0B','#6B7280','#60A5FA','#C2410C'];
  const OTHER_COLOR = '#D1D5DB';

  let sel = $state(0);
  let total = $derived(items.reduce((s, it) => s + it.value, 0) || 1);

  // Top 5 + Other bucket
  let display = $derived.by(() => {
    const sorted = [...items].sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, 5);
    const otherVal = sorted.slice(5).reduce((s, it) => s + it.value, 0);
    return otherVal > 0 ? [...top, { name: `Other (${sorted.length - 5})`, value: otherVal, isOther: true }] : top;
  });

  const R = 62, SW = 24, C = 2 * Math.PI * R, CX = 85, CY = 85;

  let segs = $derived.by(() => {
    let acc = 0;
    return display.map((it, i) => {
      const frac = it.value / total;
      const s = { frac, dash: frac * C, offset: acc * C, color: it.isOther ? OTHER_COLOR : COLORS[i % COLORS.length], ...it, i };
      acc += frac;
      return s;
    });
  });

  let selItem = $derived(display[Math.min(sel, display.length - 1)]);
</script>

<div>
  <div class="ring-wrap">
    <svg viewBox="0 0 170 170" class="ring">
      <g transform="rotate(-90 85 85)">
        {#each segs as s}
          <circle cx={CX} cy={CY} r={R} fill="none" stroke={s.color}
            stroke-width={sel === s.i ? SW + 5 : SW}
            stroke-dasharray="{s.dash} {C - s.dash}"
            stroke-dashoffset={-s.offset}
            onclick={() => (sel = s.i)}
            role="presentation"
            style="cursor:pointer;transition:stroke-width .15s" />
        {/each}
      </g>
      <text x="85" y="78" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text3)">{Math.round((selItem.value / total) * 100)}%</text>
      <text x="85" y="97" text-anchor="middle" font-size="15" font-weight="700" fill="var(--text)">{fmt0(selItem.value)}</text>
      <text x="85" y="112" text-anchor="middle" font-size="9" font-weight="500" fill="var(--text3)">{selItem.name.split(' ')[0]}</text>
    </svg>
  </div>
  <div class="legend">
    {#each segs as s}
      <button class="leg-row" style="opacity:{sel === s.i ? 1 : 0.7}" onclick={() => (sel = s.i)}>
        <span class="swatch" style="background:{s.color}"></span>
        <span class="lname" style="font-weight:{sel === s.i ? 700 : 500}">{s.name}</span>
        <span class="lpct">{Math.round((s.value / total) * 100)}%</span>
        <span class="lamt">{fmt0(s.value)}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .ring-wrap { display: flex; justify-content: center; margin-bottom: 16px; }
  .ring { width: 170px; height: 170px; }
  .legend { display: flex; flex-direction: column; gap: 1px; }
  .leg-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; background: none; border: none; border-bottom: 1px solid var(--border); cursor: pointer; width: 100%; text-align: left; }
  .swatch { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
  .lname { flex: 1; font-size: 13px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lpct { font-size: 12px; font-weight: 600; color: var(--text2); min-width: 32px; text-align: right; }
  .lamt { font-size: 12px; font-weight: 700; color: var(--text); min-width: 60px; text-align: right; }
</style>
