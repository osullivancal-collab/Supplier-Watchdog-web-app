<script>
  import { TriangleAlert } from '@lucide/svelte';
  import { fmt } from '$lib/format.js';
  let { prev } = $props();
</script>

<span class="flag" title="Price up from {prev ? fmt(prev) : 'last order'}">
  <TriangleAlert size={12} />
  {#if prev}<span>was {fmt(prev)}</span>{/if}
</span>

<style>
  .flag {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 11px; font-weight: 600; color: var(--red);
    background: color-mix(in srgb, var(--red) 12%, white);
    border-radius: 99px; padding: 2px 8px;
  }
</style>
