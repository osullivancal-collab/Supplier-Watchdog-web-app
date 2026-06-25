<script>
  import { Plus, Pencil, ChevronLeft, Trash2, Check, ChevronRight, TrendingUp, TrendingDown } from '@lucide/svelte';
  import { getWholesalers, saveWholesaler } from '$lib/api.js';
  import { spendHistory } from '$lib/data/mock.js';
  import { periodChange } from '$lib/spend.js';
  import { fmt } from '$lib/format.js';
  import MiniLine from '$lib/components/MiniLine.svelte';
  import DeliveryStatus from '$lib/components/DeliveryStatus.svelte';

  let list = $state([]);
  let editing = $state(null);

  // Load (mock now, Supabase later — same call).
  $effect(() => { getWholesalers().then((w) => (list = [...w])); });

  const histOf = (id) => spendHistory[id] ?? [];
  const totalOf = (id) => histOf(id).reduce((a, b) => a + b, 0);
  const changeOf = (id) => periodChange(histOf(id));
  // Watchlist sorted by spend, biggest first.
  let ranked = $derived([...list].sort((a, b) => totalOf(b.id) - totalOf(a.id)));
  // Connection score — how many suppliers auto-send (the setup "game").
  let connected = $derived(list.filter((w) => w.delivery === 'auto' || w.delivery === 'forward').length);

  const blank = () => ({ id: '', name: '', contact: '', phone: '', email: '', account: '' });

  async function save() {
    await saveWholesaler(editing);
    if (editing.id) list = list.map((w) => (w.id === editing.id ? editing : w));
    else list = [...list, { ...editing, id: 'w' + Date.now() }];
    editing = null;
  }
  function remove() {
    list = list.filter((w) => w.id !== editing.id);
    editing = null;
  }
</script>

<div class="title-row">
  <h1>Suppliers</h1>
  <button class="btn-primary" onclick={() => (editing = blank())}><Plus size={16} /> Add</button>
</div>

<p class="sub">Tap a supplier to see their spend over time.</p>

<!-- Connection score — the setup "game" -->
<div class="conn-banner">
  <div class="conn-bar"><div class="conn-fill" style="width:{(connected / Math.max(list.length,1)) * 100}%"></div></div>
  <p class="conn-txt"><strong>{connected} of {list.length}</strong> suppliers auto-sending invoices. The more connected, the less you miss.</p>
</div>

<div class="list">
  {#each ranked as w}
    {@const change = changeOf(w.id)}
    {@const hist = histOf(w.id)}
    {@const thisMonth = hist[hist.length - 1] ?? 0}
    {@const lastMonth = hist[hist.length - 2] ?? 0}
    {@const mom = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null}
    <div class="card wcard">
      <a class="wrow" href="/wholesalers/{w.id}">
        <div class="wleft">
          <p class="wname">{w.name}</p>
          <p class="wspend">{fmt(totalOf(w.id))} <span class="wspend-lbl">total</span></p>
          <p class="wmonth">This month: <strong>{fmt(thisMonth)}</strong>{#if mom !== null}<span class="mom" style="color:{mom > 0 ? 'var(--red)' : 'var(--green)'}"> · {mom > 0 ? '+' : ''}{mom}%</span>{/if}</p>
          <DeliveryStatus delivery={w.delivery} />
        </div>
        <div class="wright">
          <MiniLine values={histOf(w.id)} accent={change > 0 ? 'var(--danger)' : 'var(--teal)'} />
          {#if change !== null}
            <span class="wchange" style="color:{change > 0 ? 'var(--red)' : 'var(--green)'}">
              {#if change > 0}<TrendingUp size={12} />{:else}<TrendingDown size={12} />{/if}
              {change > 0 ? '+' : ''}{change}%
            </span>
          {/if}
        </div>
        <ChevronRight size={18} color="var(--text3)" />
      </a>
      <button class="edit-btn" onclick={() => (editing = { ...w })} aria-label="Edit {w.name}">
        <Pencil size={14} /> Edit details
      </button>
    </div>
  {/each}
</div>

<!-- Add/Edit modal: slides up from bottom -->
{#if editing}
  <div class="overlay" onclick={() => (editing = null)} role="presentation">
    <div class="sheet" onclick={(e) => e.stopPropagation()} role="dialog">
      <div class="sheet-head">
        <button class="icon-btn" style="color:var(--navy)" onclick={() => (editing = null)} aria-label="Close"><ChevronLeft size={18} /></button>
        <span class="sheet-title">{editing.id ? 'Edit Supplier' : 'Add Supplier'}</span>
      </div>
      <div class="sheet-body">
        <label class="field"><span class="label">Business Name</span><input class="input" bind:value={editing.name} /></label>
        <label class="field"><span class="label">Account Number</span><input class="input" bind:value={editing.account} /></label>
        <label class="field"><span class="label">Contact Person</span><input class="input" bind:value={editing.contact} /></label>
        <label class="field"><span class="label">Phone</span><input class="input" type="tel" bind:value={editing.phone} /></label>
        <label class="field"><span class="label">Email</span><input class="input" type="email" bind:value={editing.email} /></label>
      </div>
      <div class="sheet-foot">
        {#if editing.id}
          <button class="btn-ghost" style="color:var(--red);border-color:var(--red)" onclick={remove}><Trash2 size={15} /> Delete</button>
        {/if}
        <button class="btn-primary btn-full" onclick={save}><Check size={16} /> Save Supplier</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .title-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  h1 { font-size: 22px; }
  .sub { margin: 0 0 16px; font-size: 12.5px; color: var(--text2); }

  .conn-banner { margin-bottom: 12px; }
  .conn-bar { height: 8px; border-radius: 99px; background: var(--border); overflow: hidden; }
  .conn-fill { height: 100%; background: var(--green); border-radius: 99px; transition: width 0.3s ease; }
  .conn-txt { margin: 8px 0 0; font-size: 12px; color: var(--text2); }
  .conn-txt strong { color: var(--text); }

  .list { display: flex; flex-direction: column; gap: 8px; }
  .wcard { padding: 0; overflow: hidden; }
  .wrow { display: flex; align-items: center; gap: 12px; padding: 14px 12px; }
  .wleft { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .wright { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
  .wname { margin: 0; font-size: 15px; font-weight: 700; }
  .wspend { margin: 0; font-size: 16px; font-weight: 800; letter-spacing: -0.01em; }
  .wspend-lbl { font-size: 11px; font-weight: 400; color: var(--text3); }
  .wmonth { margin: 2px 0; font-size: 12px; color: var(--text2); }
  .wmonth strong { color: var(--text); }
  .mom { font-weight: 700; }
  .wchange { display: inline-flex; align-items: center; gap: 3px; font-size: 11.5px; font-weight: 700; }
  .edit-btn {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    width: 100%; padding: 9px; border: none; border-top: 1px solid var(--border);
    background: var(--section-head); color: var(--text2); font-size: 12px; font-weight: 600;
  }

  .overlay { position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column; justify-content: flex-end; background: rgba(17,24,39,0.45); }
  .sheet { background: var(--white); border-top-left-radius: 16px; border-top-right-radius: 16px; display: flex; flex-direction: column; max-height: 92vh; width: 100%; max-width: 480px; margin: 0 auto; }
  .sheet-head { display: flex; align-items: center; gap: 8px; padding: 16px; border-bottom: 1px solid var(--border); }
  .sheet-title { font-size: 16px; font-weight: 700; }
  .sheet-body { padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
  .field { display: block; }
  .field .label { display: block; margin-bottom: 6px; }
  .sheet-foot { padding: 16px; border-top: 1px solid var(--border); display: flex; gap: 10px; }
</style>
