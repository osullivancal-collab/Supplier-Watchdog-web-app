<script>
  import { Info, Check, ReceiptText } from '@lucide/svelte';
  import { fmt, fmt0 } from '$lib/format.js';
  import { billsSeed } from '$lib/data/mock.js';
  import InvoiceModal from '$lib/components/InvoiceModal.svelte';

  let bills = $state(billsSeed.map((b) => ({ ...b })));
  let tab = $state('approve');
  let viewInvoice = $state(null);

  function setStatus(id, status) {
    bills = bills.map((b) => (b.id === id ? { ...b, status } : b));
  }
  function openInvoice(b) {
    viewInvoice = { vendor: b.vendor, number: b.number, total: b.total, date: 'Jun 2026', source: b.source };
  }

  let owed = $derived(bills.filter((b) => b.status === 'owed').reduce((s, b) => s + b.total, 0));
  let probablyPaid = $derived(bills.filter((b) => b.status === 'probably_paid').reduce((s, b) => s + b.total, 0));
  let invoicedUnpaid = $derived(owed + probablyPaid);

  const tabs = [['approve', 'To Approve'], ['owed', 'Owed'], ['probably_paid', 'Probably Paid'], ['paid', 'Paid']];
  let counts = $derived({
    approve: bills.filter((b) => b.status === 'approve').length,
    owed: bills.filter((b) => b.status === 'owed').length,
    probably_paid: bills.filter((b) => b.status === 'probably_paid').length,
    paid: bills.filter((b) => b.status === 'paid').length
  });
  let shown = $derived(bills.filter((b) => b.status === tab).sort((a, b) => a.due - b.due));
</script>

<h1>Bills</h1>

<!-- Three-total header -->
<div class="card hero">
  <div class="pad">
    <span class="label amber">Total Invoiced · Unpaid</span>
    <p class="big">{fmt(invoicedUnpaid)}</p>
    <div class="subs">
      <div class="sub"><span class="sub-l">Owed now</span><span class="sub-v">{fmt0(owed)}</span></div>
      <div class="sub"><span class="sub-l">Likely paid</span><span class="sub-v red">−{fmt0(probablyPaid)}</span></div>
      <div class="sub"><span class="sub-l">Probably real</span><span class="sub-v white">{fmt0(owed)}</span></div>
    </div>
  </div>
</div>

<!-- Explainer -->
<div class="explain">
  <Info size={14} style="flex-shrink:0;margin-top:1px;color:var(--navy)" />
  <span>Bills <strong>14+ days overdue</strong> are automatically assumed paid and moved to <strong>Probably Paid</strong>, lowering your total. Nothing is deleted — confirm or restore any bill below. Your official record stays in Xero.</span>
</div>

<!-- Tabs -->
<div class="tabs">
  {#each tabs as [k, label]}
    <button class="tab" class:on={tab === k} onclick={() => (tab = k)}>
      {label}
      {#if counts[k] > 0}<span class="tcount" class:on={tab === k}>{counts[k]}</span>{/if}
    </button>
  {/each}
</div>

<!-- List -->
<div class="list">
  {#each shown as b}
    <div class="card">
      <div class="bpad">
        <div class="btop">
          <div class="binfo">
            <p class="bvendor">{b.vendor} {#if !b.trade}<span class="tag">BILL</span>{/if}</p>
            <p class="bmeta">
              {b.number}
              {#if b.status === 'owed'}<span style="color:{b.due < 0 ? 'var(--danger)' : 'var(--text2)'};font-weight:600"> · {b.due < 0 ? `${Math.abs(b.due)}d overdue` : `due in ${b.due}d`}</span>
              {:else if b.status === 'probably_paid'}<span style="color:var(--text3)"> · {Math.abs(b.due)}d overdue · assumed paid</span>
              {:else if b.status === 'approve'}<span style="color:var(--amber);font-weight:600"> · {b.confidence}% read</span>
              {:else if b.status === 'paid'}<span style="color:var(--safe);font-weight:600"> · paid</span>{/if}
            </p>
          </div>
          <span class="bamt" class:struck={b.status === 'probably_paid'}>{fmt(b.total)}</span>
        </div>
        <div class="bbtns">
          <button class="b-view" onclick={() => openInvoice(b)}><ReceiptText size={14} /> View</button>
          {#if b.status === 'approve'}
            <button class="b-primary" onclick={() => setStatus(b.id, 'owed')}><Check size={15} /> Confirm</button>
          {:else if b.status === 'owed'}
            <button class="b-primary" onclick={() => setStatus(b.id, 'paid')}><Check size={15} /> Mark Paid</button>
          {:else if b.status === 'probably_paid'}
            <button class="b-ghost" onclick={() => setStatus(b.id, 'owed')}>Restore</button>
            <button class="b-primary green" onclick={() => setStatus(b.id, 'paid')}><Check size={15} /> Confirm Paid</button>
          {:else if b.status === 'paid'}
            <button class="b-ghost" onclick={() => setStatus(b.id, 'owed')}>Mark Unpaid</button>
          {/if}
        </div>
      </div>
    </div>
  {/each}
  {#if shown.length === 0}
    <div class="card"><p class="empty">Nothing here.</p></div>
  {/if}
</div>

{#if viewInvoice}
  <InvoiceModal inv={viewInvoice} onClose={() => (viewInvoice = null)} />
{/if}

<style>
  h1 { font-size: 22px; margin: 0 0 16px; }
  .hero { background: var(--navy); border: none; margin-bottom: 8px; }
  .pad { padding: 16px; }
  .amber { color: var(--amber); }
  .big { margin: 8px 0 0; font-size: 34px; font-weight: 700; color: #fff; letter-spacing: -0.02em; }
  .subs { display: flex; gap: 8px; margin-top: 12px; }
  .sub { flex: 1; display: flex; flex-direction: column; gap: 3px; background: rgba(255,255,255,0.08); border-radius: 10px; padding: 8px 10px; }
  .sub-l { font-size: 9px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: rgba(255,255,255,0.55); }
  .sub-v { font-size: 15px; font-weight: 700; color: rgba(255,255,255,0.9); }
  .sub-v.red { color: #F87171; }
  .sub-v.white { color: #fff; }

  .explain { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; margin-bottom: 10px; background: color-mix(in srgb, var(--navy) 5%, white); border: 1px solid var(--border); border-radius: 10px; font-size: 11.5px; color: var(--text2); line-height: 1.4; }

  .tabs { display: flex; gap: 6px; margin-bottom: 10px; overflow-x: auto; }
  .tab { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; border-radius: 99px; padding: 8px 13px; border: 1.5px solid var(--border); background: #fff; color: var(--text2); cursor: pointer; }
  .tab.on { border-color: var(--navy); background: var(--navy); color: #fff; }
  .tcount { font-size: 10.5px; font-weight: 700; color: #fff; background: var(--text3); border-radius: 99px; padding: 0 6px; min-width: 16px; text-align: center; }
  .tcount.on { color: var(--navy); background: #fff; }

  .list { display: flex; flex-direction: column; gap: 8px; }
  .bpad { padding: 12px; }
  .btop { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .binfo { min-width: 0; }
  .bvendor { margin: 0; font-size: 14.5px; font-weight: 700; }
  .bmeta { margin: 2px 0 0; font-size: 11.5px; color: var(--text2); }
  .bamt { font-size: 16px; font-weight: 700; flex-shrink: 0; }
  .bamt.struck { text-decoration: line-through; color: var(--text3); }
  .tag { font-size: 9px; font-weight: 700; color: var(--navy); background: color-mix(in srgb, var(--navy) 10%, white); padding: 1px 5px; border-radius: 4px; }

  .bbtns { display: flex; gap: 8px; margin-top: 12px; }
  .b-view { display: inline-flex; align-items: center; justify-content: center; gap: 5px; height: 38px; padding: 0 14px; font-size: 13px; font-weight: 600; color: var(--text2); background: #fff; border: 1.5px solid var(--border); border-radius: 9px; cursor: pointer; flex: 0 0 auto; }
  .b-primary { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 5px; height: 38px; padding: 0 14px; font-size: 13px; font-weight: 600; color: #fff; background: var(--teal); border: none; border-radius: 9px; cursor: pointer; }
  .b-primary.green { background: var(--safe); }
  .b-ghost { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 5px; height: 38px; padding: 0 14px; font-size: 13px; font-weight: 600; color: var(--text2); background: #fff; border: 1.5px solid var(--border); border-radius: 9px; cursor: pointer; }
  .empty { padding: 24px; text-align: center; font-size: 13.5px; color: var(--text2); margin: 0; }
</style>
