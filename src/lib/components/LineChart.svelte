<script>
  import { fmt } from '$lib/format.js';
  // Full-width line chart: fills container, Y-axis labels in a fixed HTML column,
  // SVG uses viewBox="0 0 100 100" with preserveAspectRatio=none.
  // light = white-on-navy for the hero card.
  let { values = [], labels = [], light = false, h = 180, interactive = true } = $props();

  let sel = $state(null);

  const PAD_T = 14, PAD_B = 18;
  let maxV = $derived(Math.max(...values) * 1.12);
  let minV = $derived(Math.max(0, Math.min(...values) * 0.82));
  let range = $derived((maxV - minV) || 1);

  const px = (i) => values.length <= 1 ? 50 : (i * 100) / (values.length - 1);
  const py = (v) => PAD_T + (1 - (v - minV) / range) * (100 - PAD_T - PAD_B);

  let pts = $derived(values.map((v, i) => `${px(i)},${py(v)}`).join(' '));
  let area = $derived([
    `M ${px(0)},${100 - PAD_B}`,
    ...values.map((v, i) => `L ${px(i)},${py(v)}`),
    `L ${px(values.length - 1)},${100 - PAD_B}`,
    'Z',
  ].join(' '));

  let gridVals = $derived([minV + range * 0.05, minV + range * 0.48, minV + range * 0.88]);
  let stroke = $derived(light ? '#fff' : 'var(--teal)');
  let aFill = $derived(light ? 'rgba(255,255,255,0.10)' : 'color-mix(in srgb, var(--teal) 8%, white)');
  let gridC = $derived(light ? 'rgba(255,255,255,0.15)' : 'var(--border)');
  let lblC = $derived(light ? 'rgba(255,255,255,0.50)' : 'var(--text3)');
  let lblActive = $derived(light ? '#fff' : 'var(--text)');

  const fmtY = (v) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`;
</script>

<div class="lc">
  {#if interactive}
    <div class="tip">
      {#if sel !== null}
        <span class="tv" style="color:{lblActive}">{fmt(values[sel])}</span>
        <span class="tl" style="color:{light ? 'rgba(255,255,255,0.6)' : 'var(--text2)'}">·&nbsp;{labels[sel]}</span>
      {:else}
        <span class="th" style="color:{lblC}">Tap a dot for that month's spend</span>
      {/if}
    </div>
  {/if}

  <div class="body">
    <!-- Y-axis label column (HTML, fixed width, not inside SVG) -->
    <div class="yaxis" style="height:{h}px">
      {#each gridVals as v}
        <span class="ylabel" style="top:{py(v)}%;color:{lblC}">{fmtY(v)}</span>
      {/each}
    </div>

    <!-- Chart area: SVG stretches 100% with preserveAspectRatio=none -->
    <div class="chartarea" style="position:relative">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
           style="width:100%;height:{h}px;display:block">
        {#each gridVals as v, i}
          <line x1="0" y1={py(v)} x2="100" y2={py(v)}
            stroke={gridC} stroke-width="0.4"
            stroke-dasharray={i === 0 ? '0' : '2,2'} />
        {/each}
        <path d={area} fill={aFill} />
        <polyline points={pts} fill="none" stroke={stroke}
          stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" />
        {#each values as v, i}
          <circle cx={px(i)} cy={py(v)} r="1.4"
            fill={sel === i ? '#fff' : stroke}
            stroke={light ? 'rgba(26,63,82,0.7)' : '#fff'}
            stroke-width="0.6" />
        {/each}
        {#each labels as l, i}
          <text x={px(i)} y="99" text-anchor="middle"
            font-size="4" font-weight="600" fill={lblC}>{l}</text>
        {/each}
      </svg>

      <!-- Dot tap zones (HTML overlay, percentage-positioned) -->
      {#each values as v, i}
        <button
          class="dot-tap"
          style="left:{px(i)}%;top:{py(v)}%"
          onclick={() => interactive && (sel = sel === i ? null : i)}
          aria-label="{labels[i]}: {fmtY(v)}"
        >
          {#if sel === i}<div class="dot-ring" style="background:{stroke}"></div>{/if}
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .lc { width: 100%; }
  .tip { height: 24px; display: flex; align-items: baseline; gap: 6px; margin-bottom: 4px; }
  .tv { font-size: 16px; font-weight: 700; }
  .tl, .th { font-size: 10.5px; }
  .body { display: flex; gap: 0; align-items: stretch; }
  .yaxis { width: 42px; flex-shrink: 0; position: relative; }
  .ylabel { position: absolute; right: 6px; transform: translateY(-50%); font-size: 9.5px; font-weight: 700; white-space: nowrap; line-height: 1; }
  .chartarea { flex: 1; position: relative; }
  .dot-tap {
    position: absolute; transform: translate(-50%, -50%);
    width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
    background: none; border: none; cursor: pointer; z-index: 2;
  }
  .dot-ring { position: absolute; width: 10px; height: 10px; border-radius: 99px; border: 2px solid #fff; box-shadow: 0 0 0 3px rgba(255,255,255,0.3); }
</style>
