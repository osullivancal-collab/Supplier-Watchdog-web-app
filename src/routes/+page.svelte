<script>
  import { TrendingUp, TrendingDown, Hash, PieChart, Inbox, TriangleAlert, Check, ChevronRight } from '@lucide/svelte';
  import { fmt, fmt0, totalOf, pctChange, billShockScore, riserFaller, computeForecast, diversificationScore } from '$lib/format.js';
  import { sliceSpend } from '$lib/spend.js';
  import { holdings, spendHistory, months, spendTotalHistory, billsSeed, spikes, profile, deals } from '$lib/data/mock.js';
  import LineChart from '$lib/components/LineChart.svelte';
  import MiniLine from '$lib/components/MiniLine.svelte';
  import Donut from '$lib/components/Donut.svelte';
  import PeriodToggle from '$lib/components/PeriodToggle.svelte';
  import InvoiceModal from '$lib/components/InvoiceModal.svelte';

  let bills = $state(billsSeed.map((b) => ({ ...b })));
  let mode = $state('alive');
  let period = $state('6M');
  let order = $state('holdings');
  let viewInvoice = $state(null);

  // ── Deals / Medal modal ──
  let showMedal = $state(false);
  let medalBlocked = $state({});
  let hasActiveDeal = $derived(deals.some((d) => d.status === 'active'));
  let medalTop3 = $derived(
    [...holdings]
      .map((h) => {
        const spend = totalOf(spendHistory[h.id]);
        return { id: h.id, name: h.name, spend };
      })
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 3)
      .map((m) => {
        const total = holdings.reduce((s, h) => s + totalOf(spendHistory[h.id]), 0);
        return { ...m, pct: Math.round((m.spend / total) * 100) };
      })
  );

  let owed = $derived(bills.filter((b) => b.status === 'owed').reduce((s, b) => s + b.total, 0));
  let probablyPaid = $derived(bills.filter((b) => b.status === 'probably_paid').reduce((s, b) => s + b.total, 0));
  let invoicedUnpaid = $derived(owed + probablyPaid);

  let sliced = $derived(sliceSpend(spendTotalHistory, months, period));
  let mix = $derived([...holdings].map((h) => ({ name: h.name, value: totalOf(spendHistory[h.id]) })).sort((a, b) => b.value - a.value));
  let ranked = $derived([...holdings].sort((a, b) => totalOf(spendHistory[b.id]) - totalOf(spendHistory[a.id])));

  let shock = $derived(billShockScore(owed, spendTotalHistory));

  // Top Riser / Top Faller
  const nameMap = Object.fromEntries(holdings.map((h) => [h.id, h.name]));
  let rf = $derived(riserFaller(spendHistory, nameMap));

  // Forecast + diversification for home chips
  let forecast = $derived(computeForecast(spendTotalHistory, spendTotalHistory[spendTotalHistory.length - 1]));
  let divers = $derived(diversificationScore(holdings.map((h) => ({ name: h.name, history: spendHistory[h.id] }))));

  const ZONE_H = 250;

  function confirmFromQueue(id) {
    bills = bills.map((b) => b.id === id ? { ...b, status: 'owed' } : b);
  }
</script>

<h1>Site Overview</h1>

<!-- HERO -->
<div class="card hero">
  <div class="pad">
    <div class="hero-top">
      <span class="label amber">Your Exposure</span>
      <div class="seg">
        <button class="seg-b" class:on={mode === 'alive'} onclick={() => (mode = 'alive')} aria-label="Trend"><TrendingUp size={13} /></button>
        <button class="seg-b" class:on={mode === 'number'} onclick={() => (mode = 'number')} aria-label="Stats"><Hash size={13} /></button>
        <button class="seg-b" class:on={mode === 'mix'} onclick={() => (mode = 'mix')} aria-label="Mix"><PieChart size={13} /></button>
      </div>
    </div>

    {#if mode !== 'mix'}
      <div class="hero-num-wrap">
        <span class="hero-num">{fmt(invoicedUnpaid)}</span>
        {#if probablyPaid > 0}
          <p class="movement">
            <span class="m-red">−{fmt0(probablyPaid)} likely paid</span>
            <span class="m-arrow"> → </span>
            <span class="m-real">{fmt0(owed)} probably real</span>
          </p>
        {/if}
      </div>
    {/if}

    {#if mode === 'alive'}
      <div style="margin-top:8px">
        <LineChart values={sliced.values} labels={sliced.labels} light h={ZONE_H - 38} interactive />
        <div class="toggle-invert"><PeriodToggle bind:value={period} /></div>
      </div>
    {:else if mode === 'number'}
      <!-- Stats card — same height as chart zone -->
      <div class="stats-zone" style="height:{ZONE_H}px">
        <div class="stats-row">
          <div class="stat-box">
            <span class="stat-lbl">Current Exposure</span>
            <span class="stat-big">{fmt0(owed)}</span>
            <span class="stat-sub">probably real owing</span>
          </div>
          <div class="stat-box">
            <span class="stat-lbl">Bill Shock Score</span>
            <div class="score-row">
              <span class="score-num" style="color:{shock.color}">{shock.score}</span>
              <span class="score-emoji">{shock.emoji}</span>
            </div>
            <span class="score-lbl" style="color:{shock.color}">{shock.label}</span>
          </div>
        </div>
        <div class="score-bar-wrap">
          <div class="score-bar"><div class="score-fill" style="width:{shock.score}%;background:{shock.color}"></div></div>
          <div class="score-scale">
            {#each ['Low','Moderate','High','Critical'] as l}<span>{l}</span>{/each}
          </div>
        </div>
        <div class="stats-row" style="flex:1">
          {#if shock.rank}
            <div class="stat-box" style="justify-content:center">
              <span class="stat-rank">{shock.rank}</span>
            </div>
          {/if}
          <div class="stat-box" style="justify-content:center">
            <span class="stat-lbl">Monthly avg</span>
            <span style="font-size:16px;font-weight:700;color:#fff">{fmt0(shock.avg)}</span>
            {#if shock.pct !== 0}
              <span style="font-size:11px;font-weight:600;color:{shock.pct > 0 ? '#F87171' : '#4ADE80'}">{shock.pct > 0 ? '+' : ''}{shock.pct}% vs avg</span>
            {/if}
          </div>
        </div>
        <p class="stats-foot">Score based on 6-month avg · Bills 14+ days overdue assumed paid</p>
      </div>
    {:else}
      <div class="mix-card" style="margin-top:14px">
        <Donut items={mix} />
      </div>
    {/if}
  </div>
</div>

<!-- Order toggle -->
<div class="order">
  <button class="order-b" class:on={order === 'holdings'} onclick={() => (order = 'holdings')}>Holdings first</button>
  <button class="order-b" class:on={order === 'alerts'} onclick={() => (order = 'alerts')}>Alerts first</button>
</div>

<!-- Riser / Faller chips -->
<div class="chips">
  <div class="chip" style="border-color:color-mix(in srgb, var(--danger) 35%, white)">
    <span class="chip-emoji">🔥</span>
    <div>
      <p class="chip-tag">Top Riser</p>
      <p class="chip-name">{rf.riser?.name ?? '—'}</p>
      <p class="chip-pct" style="color:var(--danger)">{rf.riser ? `${rf.riser.pct > 0 ? '+' : ''}${rf.riser.pct}%` : '—'}</p>
    </div>
  </div>
  <div class="chip" style="border-color:color-mix(in srgb, var(--teal) 35%, white)">
    <span class="chip-emoji">🧊</span>
    <div>
      <p class="chip-tag">Top Faller</p>
      <p class="chip-name">{rf.faller?.name ?? '—'}</p>
      <p class="chip-pct" style="color:var(--safe)">{rf.faller ? `${rf.faller.pct}%` : '—'}</p>
    </div>
  </div>
</div>

<!-- Forecast + Insights row -->
<div class="fi-row">
  <a href="/insights" class="fi-card">
    <p class="fi-tag">June Forecast</p>
    {#if forecast}
      <p class="fi-big">{fmt(forecast.forecast)}</p>
      <p class="fi-pct" style="color:{forecast.pctVsAvg > 0 ? 'var(--danger)' : 'var(--safe)'}">{forecast.pctVsAvg > 0 ? '▲' : '▼'} {Math.abs(forecast.pctVsAvg)}% vs avg</p>
    {/if}
    <p class="fi-link">Quick view →</p>
  </a>
  <a href="/insights" class="fi-card">
    <p class="fi-tag">Insights</p>
    <p class="fi-status">{divers.status}</p>
    <p class="fi-insight">{divers.insight}</p>
    <p class="fi-link">Full report →</p>
  </a>
</div>

<!-- Active Deal + Medal Modal row -->
<div class="deal-row-home">
  {#if hasActiveDeal}
    <a href="/wholesalers" class="deal-card">
      <p class="dc-tag">Active Deal</p>
      <p class="dc-action">Tap to manage →</p>
    </a>
  {:else}
    <div class="deal-card muted">
      <p class="dc-tag">No Active Deals</p>
      <p class="dc-sub">Create one with a supplier</p>
    </div>
  {/if}
  <button class="deal-card" onclick={() => (showMedal = true)}>
    <p class="dc-tag">Show Supplier</p>
    <p class="dc-action">Your top 3 →</p>
  </button>
</div>

<!-- Medal Modal -->
{#if showMedal}
  <div class="modal-scrim" onclick={() => (showMedal = false)} role="presentation">
    <div class="modal-sheet" onclick={(e) => e.stopPropagation()} role="presentation">
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <h2>Your Spend</h2>
      </div>
      <div class="medal-list">
        {#each medalTop3 as m, i}
          <div class="medal-row">
            <span class="medal-emoji">{['🥇','🥈','🥉'][i]}</span>
            <div class="medal-info">
              <p class="medal-name">{medalBlocked[m.id] ? '●●●●●●' : m.name}</p>
              <p class="medal-meta">{medalBlocked[m.id] ? '●●% | ●●●●●' : `${m.pct}% | ${fmt(m.spend)}`}</p>
            </div>
            <button class="medal-eye" onclick={() => (medalBlocked[m.id] = !medalBlocked[m.id])}>
              {medalBlocked[m.id] ? '🚫' : '👁'}
            </button>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

{#snippet holdingsCard()}
  <div class="card sec">
    <div class="section-head"><span>Your Suppliers &amp; Bills</span><a href="/wholesalers" class="see-all">All <ChevronRight size={13} /></a></div>
    {#each ranked as h, i}
      {@const hist = spendHistory[h.id]}
      {@const c = pctChange(hist)}
      {@const up = c >= 0}
      <a class="hrow" class:bordered={i > 0} href="/wholesalers/{h.id}">
        <div class="hinfo">
          <p class="hname">{h.name} {#if h.nonTrade}<span class="tag">BILL</span>{/if}</p>
          <p class="htot">{fmt(totalOf(hist))} total</p>
        </div>
        <!-- Teal for all lines — direction is information, not judgement -->
        <MiniLine values={hist} accent="var(--teal)" />
        <div class="hright">
          <p class="hcur">{fmt(hist[hist.length - 1])}</p>
          <p class="hpct" style="color:{up ? 'var(--danger)' : 'var(--safe)'}">{up ? '▲' : '▼'} {Math.abs(c)}%</p>
        </div>
      </a>
    {/each}
  </div>
{/snippet}

{#snippet alertsCards()}
  <div class="card sec">
    <div class="section-head">
      <span><TriangleAlert size={15} color="var(--danger)" /> Price Spikes</span>
    </div>
    {#each spikes as s, i}
      {@const pct = Math.round(((s.price - s.prev) / s.prev) * 100)}
      <div class="srow" class:bordered={i > 0}>
        <div class="sinfo"><p class="sname">{s.name}</p><p class="svendor">{s.vendor}</p></div>
        <div class="sright"><p class="sprice">{fmt(s.price)}</p><p class="spct">+{pct}% from {fmt(s.prev)}</p></div>
      </div>
    {/each}
  </div>
  <div class="card sec">
    <div class="section-head"><span><Inbox size={15} color="var(--amber)" /> New — Needs Approval</span></div>
    <div class="arow">
      <div><p class="aname">Reece Plumbing</p><p class="ameta">{fmt(487.20)} · 88% read</p></div>
      <button class="b-primary" onclick={() => confirmFromQueue('b0')}><Check size={16} /> Confirm</button>
    </div>
  </div>
{/snippet}

{#if order === 'holdings'}
  {@render holdingsCard()}{@render alertsCards()}
{:else}
  {@render alertsCards()}{@render holdingsCard()}
{/if}

{#if viewInvoice}
  <InvoiceModal inv={viewInvoice} onClose={() => (viewInvoice = null)} />
{/if}

<style>
  /* Forecast + Insights row */
  .fi-row { display: flex; gap: 8px; margin-bottom: 12px; }
  .fi-card { flex: 1; padding: 14px; background: #fff; border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); text-decoration: none; display: block; }
  .fi-tag { margin: 0; font-size: 10px; font-weight: 700; color: var(--text3); text-transform: uppercase; letter-spacing: 0.6px; }
  .fi-big { margin: 6px 0 0; font-size: 24px; font-weight: 800; color: var(--text); letter-spacing: -0.02em; }
  .fi-pct { margin: 2px 0 0; font-size: 12px; font-weight: 700; }
  .fi-status { margin: 6px 0 0; font-size: 15px; font-weight: 800; color: var(--text); line-height: 1.2; }
  .fi-insight { margin: 4px 0 0; font-size: 12px; color: var(--text2); line-height: 1.3; }
  .fi-link { margin: 8px 0 0; font-size: 12px; color: var(--text3); }

  /* Active Deal + Medal row */
  .deal-row-home { display: flex; gap: 8px; margin-bottom: 12px; }
  .deal-card { flex: 1; text-align: left; padding: 14px; background: #fff; border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); cursor: pointer; text-decoration: none; display: flex; flex-direction: column; justify-content: space-between; min-height: 110px; }
  .deal-card.muted { cursor: default; }
  .dc-tag { margin: 0; font-size: 10px; font-weight: 700; color: var(--text3); text-transform: uppercase; letter-spacing: 0.6px; }
  .dc-action { margin: 4px 0 0; font-size: 14px; font-weight: 700; color: var(--text); }
  .dc-sub { margin: 4px 0 0; font-size: 13px; color: var(--text2); }

  /* Medal modal */
  .modal-scrim { position: fixed; inset: 0; z-index: 70; background: #111827; display: flex; flex-direction: column; justify-content: flex-end; }
  .modal-sheet { background: #fff; border-top-left-radius: 20px; border-top-right-radius: 20px; max-width: 480px; width: 100%; margin: 0 auto; height: 100vh; }
  .sheet-handle { width: 36px; height: 4px; border-radius: 99px; background: var(--border); margin: 12px auto 0; }
  .sheet-head { padding: 16px; }
  .sheet-head h2 { font-size: 18px; margin: 0; }
  .medal-list { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 10px; }
  .medal-row { display: flex; align-items: center; gap: 10px; padding: 12px; background: var(--section-head, #F1F5F4); border-radius: 10px; }
  .medal-emoji { font-size: 16px; }
  .medal-info { flex: 1; }
  .medal-name { margin: 0; font-size: 14px; font-weight: 700; color: var(--text); }
  .medal-meta { margin: 2px 0 0; font-size: 12px; font-weight: 600; color: var(--text2); }
  .medal-eye { width: 28px; height: 28px; border: none; background: none; cursor: pointer; font-size: 16px; }

  h1 { font-size: 22px; margin: 0 0 16px; }
  .hero { background: var(--navy); border: none; margin-bottom: 8px; }
  .pad { padding: 16px; }
  .hero-top { display: flex; align-items: center; justify-content: space-between; }
  .amber { color: var(--amber); }
  .seg { display: flex; gap: 2px; background: rgba(255,255,255,0.12); border-radius: 8px; padding: 2px; }
  .seg-b { width: 30px; height: 26px; display: grid; place-items: center; border-radius: 6px; border: none; cursor: pointer; background: transparent; color: rgba(255,255,255,0.7); }
  .seg-b.on { background: #fff; color: var(--navy); }
  .hero-num-wrap { margin-top: 10px; }
  .hero-num { font-size: 40px; font-weight: 700; color: #fff; letter-spacing: -0.02em; line-height: 1; }
  .movement { margin: 8px 0 0; font-size: 13px; font-weight: 600; }
  .m-red { color: #F87171; } .m-arrow { color: rgba(255,255,255,0.45); } .m-real { color: #fff; font-weight: 700; }
  .toggle-invert { filter: invert(1) hue-rotate(180deg); opacity: 0.92; margin-top: 2px; }
  .mix-card { background: #fff; border-radius: 12px; padding: 14px 12px; }

  .stats-zone { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
  .stats-row { display: flex; gap: 10px; }
  .stat-box { flex: 1; display: flex; flex-direction: column; gap: 2px; background: rgba(255,255,255,0.09); border-radius: 12px; padding: 10px 12px; }
  .stat-lbl { font-size: 9.5px; font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; color: rgba(255,255,255,0.5); }
  .stat-big { font-size: 22px; font-weight: 800; color: #fff; letter-spacing: -0.02em; line-height: 1.1; margin-top: 2px; }
  .stat-sub { font-size: 10.5px; color: rgba(255,255,255,0.55); }
  .score-row { display: flex; align-items: baseline; gap: 6px; margin-top: 2px; }
  .score-num { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; }
  .score-emoji { font-size: 13px; }
  .score-lbl { font-size: 11px; font-weight: 600; }
  .score-bar-wrap { flex: 0 0 auto; }
  .score-bar { height: 6px; border-radius: 99px; background: rgba(255,255,255,0.12); overflow: hidden; }
  .score-fill { height: 100%; border-radius: 99px; transition: width 0.4s ease; }
  .score-scale { display: flex; justify-content: space-between; margin-top: 4px; }
  .score-scale span { font-size: 8.5px; font-weight: 600; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.5px; }
  .stat-rank { font-size: 12px; font-weight: 700; color: #fff; text-align: center; }
  .stats-foot { margin: 0; font-size: 10.5px; color: rgba(255,255,255,0.4); line-height: 1.4; }

  .order { display: flex; gap: 6px; margin-bottom: 8px; background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 4px; }
  .order-b { flex: 1; padding: 8px 0; font-size: 12px; font-weight: 600; border: none; border-radius: 8px; background: transparent; color: var(--text2); cursor: pointer; }
  .order-b.on { background: var(--navy); color: #fff; }

  .chips { display: flex; gap: 8px; margin-bottom: 8px; }
  .chip { flex: 1; display: flex; align-items: center; gap: 12px; background: #fff; border: 1.5px solid; border-radius: 12px; padding: 12px 14px; box-shadow: var(--shadow); }
  .chip-emoji { font-size: 20px; flex-shrink: 0; }
  .chip-tag { margin: 0; font-size: 10px; font-weight: 700; color: var(--text3); text-transform: uppercase; letter-spacing: 0.6px; }
  .chip-name { margin: 2px 0 0; font-size: 15px; font-weight: 800; color: var(--text); line-height: 1.1; }
  .chip-pct { margin: 1px 0 0; font-size: 13px; font-weight: 800; }

  .sec { margin-bottom: 8px; }
  .see-all { font-size: 12px; font-weight: 600; color: var(--teal); display: inline-flex; align-items: center; }
  .bordered { border-top: 1px solid var(--border); }
  .hrow { display: flex; align-items: center; gap: 10px; padding: 10px 12px; }
  .hinfo { flex: 1; min-width: 0; }
  .hname { margin: 0; font-size: 14px; font-weight: 700; }
  .htot { margin: 1px 0 0; font-size: 11.5px; color: var(--text3); }
  .hright { text-align: right; min-width: 64px; }
  .hcur { margin: 0; font-size: 13px; font-weight: 700; }
  .hpct { margin: 1px 0 0; font-size: 11px; font-weight: 700; }
  .tag { font-size: 9px; font-weight: 700; color: var(--navy); background: color-mix(in srgb, var(--navy) 10%, white); padding: 1px 5px; border-radius: 4px; }
  .srow { display: flex; align-items: center; justify-content: space-between; padding: 12px; gap: 12px; }
  .sinfo { min-width: 0; }
  .sname { margin: 0; font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .svendor { margin: 2px 0 0; font-size: 11.5px; color: var(--text2); }
  .sright { text-align: right; flex-shrink: 0; }
  .sprice { margin: 0; font-size: 13.5px; font-weight: 700; }
  .spct { margin: 2px 0 0; font-size: 11px; font-weight: 600; color: var(--danger); }
  .arow { display: flex; align-items: center; justify-content: space-between; padding: 12px; gap: 12px; }
  .aname { margin: 0; font-size: 14px; font-weight: 700; }
  .ameta { margin: 2px 0 0; font-size: 11.5px; color: var(--text2); }
  .b-primary { display: inline-flex; align-items: center; justify-content: center; gap: 5px; height: 38px; padding: 0 14px; font-size: 13px; font-weight: 600; color: #fff; background: var(--teal); border: none; border-radius: 9px; cursor: pointer; }

  .section-head span { display: inline-flex; align-items: center; gap: 6px; }
</style>
