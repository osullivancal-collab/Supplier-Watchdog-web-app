<script>
  let { p } = $props();
  let c = $derived(p === 'P1' ? 'var(--red)' : p === 'P2' ? 'var(--amber)' : 'var(--text3)');
</script>
<span class="chip" style="background:{c}">{p}</span>
<style>
  .chip { font-size: 11px; font-weight: 600; color: #fff; border-radius: 99px; padding: 2px 8px; }
</style>
