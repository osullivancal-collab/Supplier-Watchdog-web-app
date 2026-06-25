<script>
  import { page } from '$app/stores';
  import { ChevronLeft, TrendingUp, TrendingDown, TriangleAlert, Phone, Mail, Send } from '@lucide/svelte';
  import { fmt, fDate } from '$lib/format.js';
  import { wholesalers, spendHistory, spendMonths, profile, deals } from '$lib/data/mock.js';
  import { invoices } from '$lib/stores/data.js';
  import { sliceSpend, periodChange } from '$lib/spend.js';
  import LineChart from '$lib/components/LineChart.svelte';
  import PeriodToggle from '$lib/components/PeriodToggle.svelte';
  import DeliveryStatus from '$lib/components/DeliveryStatus.svelte';
  import BarChart from '$lib/components/BarChart.svelte';

  let id = $derived($page.params.id);
  let supplier = $derived(wholesalers.find((w) => w.id === id));
  let history = $derived(spendHistory[id] ?? []);

  let period = $state('6M');
  let sliced = $derived(sliceSpend(history, spendMonths, period));

  // ── Supplier Deals ──
  let creatingDeal = $state(false);
  let dealForm = $state({ name: '', target: '', endDate: '' });
  let barPeriod = $state('6M');
  let barSliced = $derived(sliceSpend(history, spendMonths, barPeriod));
  let supplierDeals = $derived(
    deals
      .filter((d) => d.supplier === supplier?.name)
      .sort((a, b) => +new Date(b.end_date) - +new Date(a.end_date))
  );
  let lastMonthSpend = $derived(history[history.length - 1] ?? 0);

  function submitDeal() {
    if (dealForm.name && dealForm.target && dealForm.endDate) {
      creatingDeal = false;
      dealForm = { name: '', target: '', endDate: '' };
    }
  }

  // Total spent with this supplier (all history).
  let totalSpend = $derived(history.reduce((a, b) => a + b, 0));
  let change = $derived(periodChange(history));

  // This supplier's invoices (from the live store), newest first.
  let theirInvoices = $derived(
    $invoices
      .filter((i) => i.wholesaler_id === id)
      .sort((a, b) => +new Date(b.invoice_date) - +new Date(a.invoice_date))
  );

  // Which months had a price spike? (tint those bars amber)
  // Demo: flag the most recent month if any of their invoices have a spike.
  let hasSpike = $derived(
    $invoices.some((i) => i.wholesaler_id === id && i.line_items.some((li) => li.price_spike))
  );
  let spikeFlags = $derived(sliced.values.map((_, i) => hasSpike && i === sliced.values.length - 1));

  // "Email supplier" — opens the user's normal mail app, pre-filled. (Real in-app
  // sending needs the backend; mailto works today and is what most users expect.)
  let mailto = $derived.by(() => {
    if (!supplier) return '#';
    const subject = encodeURIComponent(`Invoice query — account ${supplier.account}`);
    const body = encodeURIComponent(
      `Hi ${supplier.contact || supplier.name},\n\nRegarding our account (${supplier.account})...\n\nThanks,\n${profile.full_name}\n${profile.business_name}`
    );
    return `mailto:${supplier.email}?subject=${subject}&body=${body}`;
  });
</script>

{#if supplier}
  <a href="/wholesalers" class="back"><ChevronLeft size={18} /> Suppliers</a>

  <!-- Ticker header -->
  <div class="ticker">
    <p class="t-name">{supplier.name}</p>
    <p class="t-num">{fmt(totalSpend)}</p>
    <p class="t-sub">total spend · all time</p>
    {#if change !== null}
      <span class="t-change" style="color:{change > 0 ? 'var(--red)' : 'var(--green)'}">
        {#if change > 0}<TrendingUp size={15} />{:else}<TrendingDown size={15} />{/if}
        {change > 0 ? '+' : ''}{change}% vs last month
      </span>
    {/if}
  </div>

  <!-- Chart card -->
  <div class="card chart-card">
    <LineChart values={sliced.values} labels={sliced.labels} interactive h={170} />
    <div class="toggle-wrap"><PeriodToggle bind:value={period} /></div>
    {#if hasSpike}
      <p class="spike-note"><TriangleAlert size={13} color="var(--amber)" /> Amber bar = a price spike landed this month</p>
    {/if}
  </div>

  <!-- Supplier Deals -->
  <div class="card section">
    <div class="section-head"><span>Supplier Deals</span></div>

    {#if creatingDeal}
      <div class="deal-form">
        <input type="text" placeholder="Agreement name" bind:value={dealForm.name} />
        <input type="text" placeholder="Target (e.g. $5,000 or 70%)" bind:value={dealForm.target} />
        <input type="date" bind:value={dealForm.endDate} />
        <div class="form-btns">
          <button class="btn-cancel" onclick={() => (creatingDeal = false)}>Cancel</button>
          <button class="btn-create" onclick={submitDeal}>Create</button>
        </div>
      </div>
    {:else}
      <!-- Spend bar chart for counter conversation -->
      <div class="bar-wrap">
        <BarChart values={barSliced.values} labels={barSliced.labels} h={130} />
        <div class="bar-toggle">
          {#each ['1M', '3M', '6M', '1Y'] as p}
            <button class:active={barPeriod === p} onclick={() => (barPeriod = p)}>{p}</button>
          {/each}
        </div>
      </div>

      <!-- Last month callout for counter chat -->
      <div class="callout-row">
        <div class="callout teal">
          <span class="c-lbl">Last Month</span>
          <span class="c-val">{fmt(lastMonthSpend)}</span>
        </div>
        <div class="callout">
          <span class="c-lbl">All Time</span>
          <span class="c-val">{fmt(totalSpend)}</span>
        </div>
      </div>
      <button class="btn-negotiate" onclick={() => (creatingDeal = true)}>+ Create Agreement</button>

      {#if supplierDeals.length > 0}
        <div class="deal-history">
          {#each supplierDeals as d}
            <div class="deal-row">
              <span class="deal-icon">{d.status === 'active' ? '🔄' : d.result === 'won' ? '✅' : '❌'}</span>
              <div class="deal-info">
                <p class="deal-name">{d.name}</p>
                <p class="deal-meta">{d.final_value ?? d.current_value}{d.target.includes('%') ? '%' : ''} vs {d.target}</p>
              </div>
              {#if d.status === 'completed'}
                <span class="deal-result" style="color:{d.result === 'won' ? 'var(--green)' : 'var(--red)'}">{d.result === 'won' ? 'Won' : 'Lost'}</span>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <p class="empty">No deals yet with {supplier.name}.</p>
      {/if}
    {/if}
  </div>

  <!-- Invoices behind the line -->
  <div class="card section">
    <div class="section-head"><span>Recent Invoices</span></div>
    {#each theirInvoices as inv, i}
      <div class="inv-row" class:bordered={i > 0}>
        <div>
          <p class="inv-num">{inv.invoice_number} {#if inv.doc_type === 'credit_note'}<span class="credit">CREDIT</span>{/if}</p>
          <p class="inv-date">{fDate(inv.invoice_date)}</p>
        </div>
        <span class="inv-amt" style="color:{inv.total_amount < 0 ? 'var(--green)' : 'var(--text)'}">{fmt(inv.total_amount)}</span>
      </div>
    {/each}
    {#if theirInvoices.length === 0}
      <p class="empty">No invoices yet for {supplier.name}.</p>
    {/if}
  </div>

  <!-- How invoices arrive from this supplier -->
  <div class="card section">
    <div class="section-head"><span>Invoice Delivery</span></div>
    <div class="delivery">
      <DeliveryStatus delivery={supplier.delivery} size="lg" />
    </div>
  </div>

  <!-- Contact + email supplier -->
  <div class="card contact">
    <a href="tel:{supplier.phone}"><Phone size={15} color="var(--teal)" /> {supplier.phone}</a>
    <a href="mailto:{supplier.email}"><Mail size={15} color="var(--teal)" /> {supplier.email}</a>
    <a href={mailto} class="btn-primary btn-full email-btn"><Send size={16} /> Email {supplier.name}</a>
  </div>
{:else}
  <a href="/wholesalers" class="back"><ChevronLeft size={18} /> Suppliers</a>
  <div class="card"><p class="empty">Supplier not found.</p></div>
{/if}

<style>
  /* Supplier Deals */
  .bar-wrap { margin-bottom: 14px; }
  .bar-toggle { display: flex; gap: 4px; margin-top: 12px; background: var(--section-head, #F1F5F4); border-radius: 8px; padding: 3px; }
  .bar-toggle button { flex: 1; padding: 6px 0; font-size: 11px; font-weight: 600; border: none; border-radius: 6px; background: transparent; color: var(--text2); cursor: pointer; }
  .bar-toggle button.active { background: var(--navy); color: #fff; }
  .callout-row { display: flex; gap: 8px; margin-bottom: 12px; }
  .callout { flex: 1; padding: 12px; background: var(--section-head, #F1F5F4); border-radius: 10px; }
  .callout.teal { background: color-mix(in srgb, var(--teal) 8%, white); border: 1.5px solid color-mix(in srgb, var(--teal) 30%, white); }
  .c-lbl { display: block; font-size: 10px; font-weight: 700; color: var(--text3); text-transform: uppercase; letter-spacing: 0.5px; }
  .c-val { display: block; margin-top: 4px; font-size: 20px; font-weight: 800; color: var(--text); }
  .btn-negotiate { width: 100%; padding: 12px; background: var(--teal); color: #fff; border: none; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; }
  .deal-form { display: flex; flex-direction: column; gap: 10px; }
  .deal-form input { padding: 12px; border-radius: 8px; border: 1px solid var(--border); font-size: 14px; font-family: inherit; }
  .form-btns { display: flex; gap: 8px; }
  .btn-cancel { flex: 1; padding: 12px; border: 1px solid var(--border); background: none; border-radius: 8px; cursor: pointer; font-weight: 600; }
  .btn-create { flex: 1; padding: 12px; background: var(--teal); color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; }
  .deal-history { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
  .deal-row { display: flex; align-items: flex-start; gap: 8px; padding: 8px; }
  .deal-icon { font-size: 16px; margin-top: 1px; }
  .deal-info { flex: 1; min-width: 0; }
  .deal-name { margin: 0; font-size: 12px; font-weight: 700; color: var(--text); }
  .deal-meta { margin: 1px 0 0; font-size: 11px; color: var(--text2); }
  .deal-result { font-size: 11px; font-weight: 700; margin-top: 2px; }

  .back { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; color: var(--text2); margin-bottom: 12px; }

  .ticker { margin-bottom: 12px; }
  .t-name { margin: 0; font-size: 14px; font-weight: 600; color: var(--text2); }
  .t-num { margin: 4px 0 0; font-size: 38px; font-weight: 700; letter-spacing: -0.02em; }
  .t-sub { margin: 0; font-size: 11.5px; color: var(--text3); text-transform: uppercase; letter-spacing: 0.6px; }
  .t-change { display: inline-flex; align-items: center; gap: 4px; margin-top: 8px; font-size: 13px; font-weight: 700; }

  .chart-card { padding: 16px; margin-bottom: 8px; }
  .toggle-wrap { margin-top: 12px; }
  .spike-note { display: flex; align-items: center; gap: 6px; margin: 10px 0 0; font-size: 11.5px; color: var(--text2); }

  .section { margin-bottom: 8px; }
  .inv-row { display: flex; align-items: center; justify-content: space-between; padding: 12px; }
  .bordered { border-top: 1px solid var(--border); }
  .inv-num { margin: 0; font-size: 13.5px; font-weight: 600; }
  .credit { font-size: 10px; font-weight: 700; color: var(--green); background: color-mix(in srgb, var(--green) 12%, white); padding: 1px 5px; border-radius: 4px; }
  .inv-date { margin: 2px 0 0; font-size: 11.5px; color: var(--text2); }
  .inv-amt { font-size: 14px; font-weight: 700; }

  .contact { display: flex; flex-direction: column; gap: 8px; padding: 14px; font-size: 13px; }
  .contact a:not(.email-btn) { display: flex; align-items: center; gap: 8px; }
  .email-btn { margin-top: 6px; text-decoration: none; }
  .delivery { padding: 12px; }

  .empty { padding: 16px 12px; margin: 0; font-size: 13px; color: var(--text2); }
</style>
