<script>
  import { Mail } from '@lucide/svelte';
  let { show, vendor, amount } = $props();
</script>

{#if show}
  <div class="toast">
    <div class="ic"><Mail size={16} /></div>
    <div>
      <p class="t1">New bill from {vendor}</p>
      <p class="t2">{amount} · added to review queue</p>
    </div>
  </div>
{/if}

<style>
  .toast {
    position: fixed; left: 50%; transform: translateX(-50%);
    bottom: 88px; z-index: 80;
    display: flex; align-items: center; gap: 10px;
    background: var(--navy); color: #fff;
    padding: 12px 16px; border-radius: 12px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.25);
    animation: slideUp 0.3s ease;
    max-width: 90vw;
  }
  .ic { width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; background: var(--teal); flex-shrink: 0; }
  .t1 { margin: 0; font-size: 13.5px; font-weight: 700; }
  .t2 { margin: 2px 0 0; font-size: 11.5px; color: rgba(255,255,255,0.7); }
  @keyframes slideUp { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translate(-50%, 0); } }
</style>
