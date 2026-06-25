<script>
  import { ChevronLeft, ReceiptText, Info, Download, Camera, Send } from '@lucide/svelte';
  import { fmt } from '$lib/format.js';
  // Mocked invoice viewer: shows the saved original + Save/Share.
  // Real version loads a signed URL from Supabase Storage (compressed preview first).
  let { inv, onClose } = $props();
  let toast = $state('');
  function act(label) { toast = label; setTimeout(() => (toast = ''), 1600); }
</script>

<div class="overlay" onclick={onClose} role="presentation">
  <div class="sheet" onclick={(e) => e.stopPropagation()} role="dialog">
    <div class="head">
      <button class="x" onclick={onClose} aria-label="Close"><ChevronLeft size={18} /></button>
      <div class="ht">
        <p class="hv">{inv.vendor}</p>
        <p class="hn">{inv.number} · {inv.date}</p>
      </div>
      <span class="hamt">{fmt(inv.total)}</span>
    </div>

    <div class="body">
      <div class="doc">
        <div class="doc-top">
          <div><p class="doc-vendor">{inv.vendor}</p><p class="doc-sub">TAX INVOICE</p></div>
          <div class="doc-ic"><ReceiptText size={20} color="var(--text3)" /></div>
        </div>
        <p class="m">Invoice #: {inv.number}</p>
        <p class="m">Account: SITE CREW PTY LTD</p>
        <div class="doc-lines">
          <div class="dl"><span>Item lines…</span><span>{fmt(inv.total)}</span></div>
        </div>
        <div class="doc-total"><span>TOTAL</span><span>{fmt(inv.total)}</span></div>
      </div>
      <p class="hint"><Info size={12} /> Original received by {inv.source}. Stored securely — preview is compressed, full quality on save.</p>
    </div>

    <div class="foot">
      <button class="g" onclick={() => act('Saved to Files')}><Download size={16} /> Files</button>
      <button class="g" onclick={() => act('Saved to Photos')}><Camera size={16} /> Photos</button>
      <button class="p" onclick={() => act('Share sheet opened')}><Send size={16} /> Share</button>
    </div>
    {#if toast}<div class="toast">{toast}</div>{/if}
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; z-index: 70; background: rgba(17,24,39,0.55); display: flex; flex-direction: column; justify-content: flex-end; }
  .sheet { background: #fff; border-top-left-radius: 16px; border-top-right-radius: 16px; max-height: 92vh; display: flex; flex-direction: column; max-width: 480px; width: 100%; margin: 0 auto; position: relative; }
  .head { display: flex; align-items: center; gap: 8px; padding: 16px; border-bottom: 1px solid var(--border); }
  .x { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 8px; border: none; background: var(--bg); color: var(--navy); cursor: pointer; }
  .ht { flex: 1; min-width: 0; }
  .hv { margin: 0; font-size: 15px; font-weight: 700; }
  .hn { margin: 1px 0 0; font-size: 11.5px; color: var(--text2); }
  .hamt { font-size: 16px; font-weight: 700; }
  .body { padding: 16px; overflow-y: auto; background: var(--bg); }
  .doc { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 20px; box-shadow: var(--shadow); font-family: ui-monospace, monospace; font-size: 11px; color: var(--text2); line-height: 1.7; }
  .doc-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
  .doc-vendor { margin: 0; font-size: 14px; font-weight: 700; color: var(--text); font-family: 'Inter', sans-serif; }
  .doc-sub { margin: 2px 0 0; }
  .doc-ic { width: 40px; height: 40px; border-radius: 6px; background: var(--bg); display: grid; place-items: center; }
  .m { margin: 0; }
  .doc-lines { border-top: 1px dashed var(--border); border-bottom: 1px dashed var(--border); margin: 12px 0; padding: 10px 0; }
  .dl { display: flex; justify-content: space-between; }
  .doc-total { display: flex; justify-content: space-between; font-weight: 700; color: var(--text); font-family: 'Inter', sans-serif; font-size: 13px; }
  .hint { margin: 10px 2px 0; font-size: 11px; color: var(--text3); display: flex; align-items: center; gap: 5px; }
  .foot { padding: 16px; border-top: 1px solid var(--border); display: flex; gap: 10px; }
  .g { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 5px; background: #fff; color: var(--text2); font-weight: 600; font-size: 13px; border: 1.5px solid var(--border); border-radius: 10px; height: 44px; cursor: pointer; }
  .p { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 5px; background: var(--teal); color: #fff; font-weight: 600; font-size: 13px; border: none; border-radius: 10px; height: 44px; cursor: pointer; }
  .toast { position: absolute; bottom: 88px; left: 50%; transform: translateX(-50%); background: var(--navy); color: #fff; font-size: 12.5px; font-weight: 600; padding: 10px 16px; border-radius: 10px; box-shadow: 0 6px 20px rgba(0,0,0,0.25); }
</style>
