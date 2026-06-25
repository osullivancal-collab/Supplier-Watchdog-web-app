<script>
  import { fmt } from '$lib/format.js';

  // values: number[] aligned to labels: string[]. accent: bar colour.
  // spikeFlags: optional bool[] — tints a bar amber if that period had a price spike.
  let { values = [], labels = [], accent = 'var(--teal)', spikeFlags = [] } = $props();

  let selected = $state(null); // index of tapped bar

  let max = $derived(Math.max(...values, 1));
  // Chart geometry
  const H = 160;        // drawable height for bars
  const GAP = 6;        // visual gap handled via flex; SVG uses % widths

  let selectedVal = $derived(selected !== null ? values[selected] : null);
  let selectedLabel = $derived(selected !== null ? labels[selected] : null);
</script>

<div class="chart">
  <!-- Tooltip / readout -->
  <div class="readout">
    {#if selected !== null}
      <span class="ro-val">{fmt(selectedVal)}</span>
      <span class="ro-lbl">{selectedLabel}</span>
    {:else}
      <span class="ro-hint">Tap a bar for the month's spend</span>
    {/if}
  </div>

  <div class="bars" style="height:{H}px">
    {#each values as v, i}
      {@const h = Math.max((v / max) * H, v > 0 ? 4 : 1)}
      {@const isSpike = spikeFlags[i]}
      {@const on = selected === i}
      <button
        class="bar-col"
        onclick={() => (selected = selected === i ? null : i)}
        aria-label="{labels[i]}: {fmt(v)}"
      >
        <span
          class="bar"
          style="
            height:{h}px;
            background:{on ? accent : isSpike ? 'var(--amber)' : `color-mix(in srgb, ${accent} 55%, white)`};
          "
        ></span>
        <span class="bar-lbl" class:on>{labels[i]}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .chart { width: 100%; }
  .readout { height: 34px; display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
  .ro-val { font-size: 20px; font-weight: 700; color: var(--text); }
  .ro-lbl { font-size: 12px; color: var(--text2); }
  .ro-hint { font-size: 12px; color: var(--text3); }

  .bars { display: flex; align-items: flex-end; gap: 6px; }
  .bar-col {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
    gap: 6px; background: none; border: none; padding: 0; height: 100%;
  }
  .bar {
    width: 100%; max-width: 38px; border-radius: 6px 6px 0 0;
    transition: background 0.15s ease;
  }
  .bar-lbl { font-size: 10px; font-weight: 600; color: var(--text3); }
  .bar-lbl.on { color: var(--text); }
</style>
