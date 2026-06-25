<script>
  // Bitcoin-style time toggles. value is bound; options are period keys.
  let { value = $bindable('6M'), options = ['1M', '3M', '6M', 'YTD', 'All'] } = $props();
</script>

<div class="toggle">
  {#each options as opt}
    <button class="t" class:on={value === opt} onclick={() => (value = opt)}>{opt}</button>
  {/each}
</div>

<style>
  .toggle { display: flex; gap: 4px; }
  .t {
    flex: 1; padding: 7px 0; font-size: 12px; font-weight: 600;
    border: none; border-radius: 8px; background: transparent; color: var(--text2);
  }
  .t.on { background: color-mix(in srgb, var(--navy) 8%, white); color: var(--navy); }
</style>
