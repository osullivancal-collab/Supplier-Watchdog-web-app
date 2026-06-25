<script>
  // Tiny inline bar sparkline for watchlist rows.
  let { values = [], accent = 'var(--teal)' } = $props();
  let max = $derived(Math.max(...values, 1));
</script>

<span class="spark">
  {#each values as v}
    <span class="sbar" style="height:{Math.max((v / max) * 100, 8)}%; background:{accent}"></span>
  {/each}
</span>

<style>
  .spark { display: inline-flex; align-items: flex-end; gap: 2px; height: 28px; width: 64px; }
  .sbar { flex: 1; border-radius: 2px 2px 0 0; opacity: 0.65; }
</style>
