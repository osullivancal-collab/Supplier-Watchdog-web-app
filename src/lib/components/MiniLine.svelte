<script>
  let { values = [], accent = 'var(--teal)' } = $props();
  let max = $derived(Math.max(...values));
  let min = $derived(Math.min(...values));
  let range = $derived((max - min) || 1);
  const W = 64, H = 26, P = 2;
  const x = (i) => P + (i * (W - P * 2)) / (values.length - 1);
  const y = (v) => P + (1 - (v - min) / range) * (H - P * 2);
  let pts = $derived(values.map((v, i) => `${x(i)},${y(v)}`).join(' '));
</script>

<svg viewBox={`0 0 ${W} ${H}`} style="width:{W}px;height:{H}px">
  <polyline points={pts} fill="none" stroke={accent} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="0.8" />
</svg>
