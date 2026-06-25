<script>
  import { ChevronRight, Camera, ReceiptText, Mail } from '@lucide/svelte';
  let { inboundEmail = '', onClose } = $props();
  let copied = $state(false);
  function copy() {
    navigator.clipboard?.writeText(inboundEmail);
    copied = true; setTimeout(() => (copied = false), 1600);
  }
</script>

<div class="overlay" onclick={onClose} role="presentation">
  <div class="sheet" onclick={(e) => e.stopPropagation()} role="dialog">
    <div class="handle-wrap"><div class="handle"></div></div>
    <div class="pad">
      <p class="title">Add a Bill</p>
      <p class="sub">Three ways to get an invoice into Watchdog.</p>

      <label class="row">
        <div class="ic" style="background:var(--teal)"><Camera size={22} color="#fff" /></div>
        <div class="rinfo">
          <p class="rtitle">Snap a photo</p>
          <p class="rsub">Point your camera at a paper docket or invoice</p>
        </div>
        <ChevronRight size={18} color="var(--text3)" />
        <input type="file" accept="image/*" capture="environment" hidden />
      </label>

      <div class="divider"></div>

      <label class="row">
        <div class="ic" style="background:var(--navy)"><ReceiptText size={22} color="#fff" /></div>
        <div class="rinfo">
          <p class="rtitle">Upload a file</p>
          <p class="rsub">PDF or image from your phone's files</p>
        </div>
        <ChevronRight size={18} color="var(--text3)" />
        <input type="file" accept="image/*,application/pdf" hidden />
      </label>

      <div class="divider"></div>

      <div class="row" onclick={copy} role="presentation" style="cursor:pointer">
        <div class="ic" style="background:var(--amber)"><Mail size={22} color="#fff" /></div>
        <div class="rinfo">
          <p class="rtitle">Forward to your unique email</p>
          <p class="rsub mono">{inboundEmail}</p>
        </div>
        <button class="copy-btn" class:done={copied} onclick={(e) => { e.stopPropagation(); copy(); }}>
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>

      <p class="hint">Set this as your billing email with any supplier and invoices arrive automatically.</p>
    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; z-index: 70; background: rgba(17,24,39,0.5); display: flex; flex-direction: column; justify-content: flex-end; }
  .sheet { background: #fff; border-top-left-radius: 20px; border-top-right-radius: 20px; max-width: 480px; width: 100%; margin: 0 auto; }
  .handle-wrap { display: flex; justify-content: center; padding: 12px 0 4px; }
  .handle { width: 40px; height: 4px; border-radius: 99px; background: var(--border); }
  .pad { padding: 8px 20px 40px; }
  .title { margin: 0 0 4px; font-size: 17px; font-weight: 700; color: var(--text); }
  .sub { margin: 0 0 20px; font-size: 13px; color: var(--text2); }
  .row { display: flex; align-items: center; gap: 14px; padding: 13px 0; }
  label.row { cursor: pointer; }
  .ic { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; flex-shrink: 0; }
  .rinfo { flex: 1; min-width: 0; }
  .rtitle { margin: 0; font-size: 14px; font-weight: 700; color: var(--text); }
  .rsub { margin: 2px 0 0; font-size: 12px; color: var(--text2); }
  .rsub.mono { font-family: ui-monospace, monospace; color: var(--teal); }
  .divider { height: 1px; background: var(--border); }
  .copy-btn { font-size: 11px; font-weight: 700; border: none; border-radius: 8px; padding: 6px 10px; cursor: pointer; background: color-mix(in srgb, var(--navy) 10%, white); color: var(--navy); }
  .copy-btn.done { background: color-mix(in srgb, var(--safe) 15%, white); color: var(--safe); }
  .hint { margin: 16px 0 0; font-size: 11.5px; color: var(--text3); text-align: center; }
</style>
