<script>
  let { delivery, size = 'sm' } = $props();

  // Colored dot indicates how invoices arrive from this supplier.
  const map = {
    auto:    { c: 'var(--green)', label: 'Auto-sending', hint: 'Invoices come straight from this supplier.' },
    inbox:   { c: 'var(--teal)',  label: 'Inbox rule',   hint: 'Caught by your inbox forward rule — covers new suppliers automatically.' },
    forward: { c: 'var(--teal)',  label: 'Forwarded',    hint: 'A mail rule catches their emails.' },
    manual:  { c: 'var(--amber)', label: 'Manual only',  hint: "You upload these yourself — set up auto-send so you don't miss any." }
  };
  let m = $derived(map[delivery] ?? map.manual);
</script>

<span class="ds" class:lg={size === 'lg'} style="color:{m.c}">
  <span class="dot" class:lg={size === 'lg'} style="background:{m.c}"></span>
  <span>{m.label}</span>
</span>
{#if size === 'lg'}<p class="hint">{m.hint}</p>{/if}

<style>
  .ds { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; }
  .ds.lg { font-size: 13px; }
  .dot { width: 8px; height: 8px; border-radius: 99px; flex-shrink: 0; }
  .dot.lg { width: 9px; height: 9px; }
  .hint { margin: 4px 0 0; font-size: 11.5px; color: var(--text2); }
</style>
