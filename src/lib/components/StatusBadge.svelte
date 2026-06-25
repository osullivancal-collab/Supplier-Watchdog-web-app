<script>
  let { status } = $props();
  const map = {
    confirmed: { c: 'var(--green)', label: 'Confirmed' },
    review:    { c: 'var(--amber)', label: 'Review' },
    parsed:    { c: 'var(--text3)', label: 'Parsed' },
    paid:      { c: 'var(--green)', label: 'Paid' }
  };
  let m = $derived(map[status] ?? map.parsed);
</script>

<span class="badge">
  <span class="dot" style="background:{m.c}"></span>
  <span>{m.label}</span>
</span>

<style>
  .badge { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; color: var(--text); }
  .dot { width: 7px; height: 7px; border-radius: 99px; }
</style>
