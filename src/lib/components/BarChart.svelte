<script>
  import { fmt } from '$lib/format.js';
  // Tappable bar chart: monthly spend bars, tap a bar to reveal its total.
  // Used in the supplier Negotiate Deal flow.
  let { values = [], labels = [], h = 140 } = $props();

  let selected = $state(null);
  let maxVal = $derived(Math.max(...values, 1));

  function tapBar(i) {
    selected = selected === i ? null : i;
  }
</script>

<div class="bc">
  {#if selected !== null}
    <div class="bc-tip">
      <span class="bc-label">{labels[selected]}</span>
      <span class="bc-value">{fmt(values[selected])}</span>
    </div>
  {/if}

  <div class="bc-bars" style="height:{h}px">
    {#each values as v, i}
      {@const barH = maxVal > 0 ? (v / maxVal) * 100 : 0}
      <button class="bc-bar-btn" onclick={() => tapBar(i)}>
        <div
          class="bc-bar"
          class:selected={selected === i}
          style="height:{barH}%"
        ></div>
        <span class="bc-bar-label">{labels[i]}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .bc { width: 100%; }
  .bc-tip {
    margin-bottom: 10px; padding: 8px 12px;
    background: color-mix(in srgb, var(--teal) 10%, white);
    border-radius: 8px; display: flex; justify-content: space-between; align-items: center;
  }
  .bc-label { font-size: 12px; font-weight: 600; color: var(--text2); }
  .bc-value { font-size: 16px; font-weight: 800; color: var(--teal); }
  .bc-bars { display: flex; align-items: flex-end; justify-content: space-between; gap: 6px; }
  .bc-bar-btn {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
    gap: 4px; background: none; border: none; cursor: pointer; height: 100%; padding: 0;
  }
  .bc-bar {
    width: 100%; min-height: 4px;
    background: color-mix(in srgb, var(--teal) 45%, white);
    border-radius: 4px 4px 0 0; transition: all 0.2s ease;
  }
  .bc-bar.selected { background: var(--teal); }
  .bc-bar-label { font-size: 9px; color: var(--text3); font-weight: 600; }
</style>
