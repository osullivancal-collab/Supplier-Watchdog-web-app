<script>
  import { Package } from '@lucide/svelte';
  import { fmt } from '$lib/format.js';
  import { invoices } from '$lib/stores/data.js';
  import SpikeFlag from '$lib/components/SpikeFlag.svelte';

  // Materials are derived from line items across all invoices — latest price per normalized_key.
  let materials = $derived.by(() => {
    const map = new Map();
    for (const inv of $invoices) {
      if (inv.doc_type === 'credit_note') continue;
      for (const li of inv.line_items) {
        const existing = map.get(li.normalized_key);
        if (!existing || new Date(inv.invoice_date) > new Date(existing.invoice_date)) {
          map.set(li.normalized_key, {
            key: li.normalized_key,
            name: li.raw_description,
            vendor: inv.wholesaler_name,
            unit_price: li.unit_price,
            invoice_date: inv.invoice_date,
            price_spike: li.price_spike,
            prev_unit_price: li.prev_unit_price
          });
        }
      }
    }
    return [...map.values()];
  });
</script>

<div class="title-row"><h1>Materials</h1></div>
<p class="sub">Latest price you've paid for each item, pulled from your invoices.</p>

<div class="list">
  {#each materials as m}
    <div class="card row">
      <div class="ic"><Package size={18} /></div>
      <div class="info">
        <div class="name-row">
          <p class="name">{m.name}</p>
          {#if m.price_spike}<SpikeFlag prev={m.prev_unit_price} />{/if}
        </div>
        <p class="meta">{m.vendor}</p>
      </div>
      <span class="price">{fmt(m.unit_price)}</span>
    </div>
  {/each}
</div>

<style>
  .title-row { margin-bottom: 4px; }
  h1 { font-size: 22px; }
  .sub { margin: 0 0 16px; font-size: 12.5px; color: var(--text2); }
  .list { display: flex; flex-direction: column; gap: 8px; }
  .row { display: flex; align-items: center; gap: 12px; padding: 12px; }
  .ic { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; background: color-mix(in srgb, var(--navy) 8%, white); color: var(--navy); flex-shrink: 0; }
  .info { min-width: 0; flex: 1; }
  .name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .name { margin: 0; font-size: 14px; font-weight: 700; }
  .meta { margin: 2px 0 0; font-size: 11.5px; color: var(--text2); }
  .price { font-size: 16px; font-weight: 700; flex-shrink: 0; }
</style>
