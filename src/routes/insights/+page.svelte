<script>
  import { ChevronLeft } from '@lucide/svelte';
  import { fmt, fmt0, totalOf, billShockScore, computeForecast, diversificationScore } from '$lib/format.js';
  import { holdings, spendHistory, months, spendTotalHistory, billsSeed, spikes } from '$lib/data/mock.js';
  import LineChart from '$lib/components/LineChart.svelte';

  // Build supplier array shape that diversificationScore expects.
  const suppliers = holdings.map((h) => ({ name: h.name, history: spendHistory[h.id] }));

  const bills = billsSeed;
  const owed = bills.filter((b) => b.status === 'owed').reduce((s, b) => s + b.total, 0);
  const probPaid = bills.filter((b) => b.status === 'probably_paid').reduce((s, b) => s + b.total, 0);
  const invoiced = owed + probPaid;

  const forecast = computeForecast(spendTotalHistory, spendTotalHistory[spendTotalHistory.length - 1]);
  const divers = diversificationScore(suppliers);
  const shock = billShockScore(owed, spendTotalHistory);

  // Biggest bill right now
  const biggestBill = [...bills].filter((b) => b.status === 'owed').sort((a, b) => b.total - a.total)[0];

  // Spending trend — last 3 vs prior 3 months
  const last3 = spendTotalHistory.slice(-3).reduce((s, v) => s + v, 0) / 3;
  const prior3 = spendTotalHistory.slice(-6, -3).reduce((s, v) => s + v, 0) / 3;
  const trendPct = prior3 ? Math.round(((last3 - prior3) / prior3) * 100) : 0;
  const trendUp = trendPct > 0;

  const spikeExtra = spikes.reduce((s, sp) => s + (sp.price - sp.prev), 0);

  // Shock history — last 3 months
  const shockHistory = spendTotalHistory.slice(-4, -1).map((v, i) => {
    const s = billShockScore(v, spendTotalHistory.slice(0, spendTotalHistory.length - 3 + i));
    return { month: months[months.length - 4 + i], color: s.color, score: s.score };
  });

  let speaking = $state(false);
  function readAloud() {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const lines = [
      `Your current exposure is ${fmt(owed)}.`,
      forecast ? `Forecast: ${fmt(forecast.forecast)}, ${Math.abs(forecast.pctVsAvg)} percent ${forecast.pctVsAvg > 0 ? 'above' : 'below'} average.` : '',
      `Bill shock: ${shock.headline.replace(/[🟢🟠🔴]/g, '').trim()}.`,
      `Spending ${trendUp ? 'up' : 'down'} ${Math.abs(trendPct)} percent versus the prior three months.`,
      `Supplier health: ${divers.status.replace(/[⚠️💡✅🟠]/g, '').trim()}. ${divers.action}.`,
    ].filter(Boolean);
    const u = new SpeechSynthesisUtterance(lines.join(' '));
    u.rate = 0.95;
    u.onstart = () => (speaking = true);
    u.onend = () => (speaking = false);
    window.speechSynthesis.speak(u);
  }
  function stopSpeaking() { window.speechSynthesis.cancel(); speaking = false; }

  function exportCSV() {
    const rows = [['Month', ...suppliers.map((s) => s.name), 'Total']];
    months.forEach((m, i) => rows.push([m, ...suppliers.map((s) => s.history[i] ?? 0), spendTotalHistory[i]]));
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'watchdog-spend.csv'; a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="head">
  <a href="/" class="back-btn"><ChevronLeft size={18} /></a>
  <h1>Insights</h1>
  <button class="hbtn" class:active={speaking} onclick={speaking ? stopSpeaking : readAloud}>{speaking ? '⏹ Stop' : '🔊 Read'}</button>
  <button class="hbtn" onclick={exportCSV}>↓ CSV</button>
</div>

<div class="body">
  <!-- 1. Current Balance -->
  <div class="bal-card">
    <span class="bal-tag">Current Balance</span>
    <p class="bal-num">{fmt(invoiced)}</p>
    <div class="bal-tiles">
      <div class="bal-tile"><span class="bt-lbl">Owed now</span><span class="bt-val">{fmt0(owed)}</span></div>
      <div class="bal-tile"><span class="bt-lbl">Likely paid</span><span class="bt-val red">−{fmt0(probPaid)}</span></div>
      <div class="bal-tile"><span class="bt-lbl">Probably real</span><span class="bt-val">{fmt0(owed)}</span></div>
    </div>
    {#if biggestBill}
      <div class="biggest">
        <div>
          <p class="big-lbl">Biggest bill right now</p>
          <p class="big-name">{biggestBill.vendor}</p>
        </div>
        <span class="big-amt">{fmt(biggestBill.total)}</span>
      </div>
    {/if}
  </div>

  <!-- 2. Bill Shock -->
  <div class="card">
    <span class="label">Your Bill Shock</span>
    <p class="shock-head">{shock.headline}</p>
    <p class="shock-sub">{shock.sub}</p>
    <div class="meter"><div class="meter-fill" style="width:{shock.score}%;background:{shock.color}"></div></div>
    {#if shockHistory.length > 0}
      <p class="mini-lbl">Recent trend</p>
      <div class="trend-row">
        {#each shockHistory as hh}
          <div class="trend-cell">
            <p class="tc-month">{hh.month}</p>
            <div class="tc-dot" style="background:{hh.color}"></div>
            <p class="tc-score" style="color:{hh.color}">{hh.score}</p>
          </div>
        {/each}
        <div class="trend-cell current" style="border-color:{shock.color}40">
          <p class="tc-month">{months[months.length - 1]}</p>
          <div class="tc-dot" style="background:{shock.color}"></div>
          <p class="tc-score" style="color:{shock.color}">{shock.score}</p>
        </div>
      </div>
    {/if}
  </div>

  <!-- 3. Spending Trend -->
  <div class="card">
    <span class="label">Spending Trend</span>
    <div class="trend-head">
      <span class="th-big" style="color:{trendUp ? 'var(--red)' : 'var(--green)'}">{trendUp ? '▲' : '▼'} {Math.abs(trendPct)}%</span>
      <span class="th-sub">vs prior 3 months</span>
    </div>
    <p class="trend-text">
      Your last 3-month average is <strong>{fmt0(last3)}/mo</strong> compared to <strong>{fmt0(prior3)}/mo</strong> before that.
      {trendUp ? ' Spend is tracking higher — worth knowing before end of month.' : ' Spend is tracking lower — quieter period or jobs winding down.'}
    </p>
    {#if spikes.length > 0}
      <div class="spike-warn">⚠️ {spikes.length} price spike{spikes.length > 1 ? 's' : ''} detected — extra {fmt0(spikeExtra)} vs last order</div>
    {/if}
    <div class="chart-hold"><LineChart values={spendTotalHistory} labels={months} h={160} interactive /></div>
  </div>

  <!-- 4. Supplier Health -->
  <div class="card">
    <span class="label">Supplier Health</span>
    <p class="health-status">{divers.status}</p>
    <p class="health-insight">{divers.insight}</p>
    <div class="score-row">
      <span class="sr-lbl">Portfolio diversity score</span>
      <span class="sr-val" style="color:{divers.score > 60 ? 'var(--green)' : divers.score > 35 ? 'var(--amber)' : 'var(--red)'}">{divers.score}/100</span>
    </div>
    <div class="meter"><div class="meter-fill" style="width:{divers.score}%;background:{divers.score > 60 ? 'var(--green)' : divers.score > 35 ? 'var(--amber)' : 'var(--red)'}"></div></div>
    <div class="health-bars">
      {#each divers.shares as sh, i}
        <div class="hb-row">
          <span class="hb-name">{suppliers[i]?.name}</span>
          <div class="hb-track"><div class="hb-fill" style="width:{sh}%;background:{sh > 35 ? 'var(--red)' : sh > 20 ? 'var(--amber)' : 'var(--teal)'}"></div></div>
          <span class="hb-pct" style="color:{sh > 35 ? 'var(--red)' : 'var(--text2)'}">{Math.round(sh)}%</span>
        </div>
      {/each}
    </div>
    <div class="action-box">💡 {divers.action}</div>
  </div>

  <!-- 5. Forecast -->
  {#if forecast}
    <div class="card">
      <span class="label">June Forecast</span>
      <div class="fc-head">
        <span class="fc-big">{fmt(forecast.forecast)}</span>
        <span class="fc-pct" style="color:{forecast.pctVsAvg > 0 ? 'var(--red)' : 'var(--green)'}">{forecast.pctVsAvg > 0 ? '▲' : '▼'} {Math.abs(forecast.pctVsAvg)}% vs avg</span>
      </div>
      <div class="fc-tiles">
        <div class="fc-tile"><span class="fct-lbl">Expected</span><span class="fct-val">{fmt0(forecast.forecast)}</span></div>
        <div class="fc-tile"><span class="fct-lbl">Your avg</span><span class="fct-val">{fmt0(forecast.avg)}</span></div>
        <div class="fc-tile"><span class="fct-lbl">Difference</span><span class="fct-val" style="color:{forecast.pctVsAvg > 0 ? 'var(--red)' : 'var(--green)'}">{forecast.pctVsAvg > 0 ? '+' : ''}{forecast.pctVsAvg}%</span></div>
      </div>
      <p class="fc-note">{forecast.confidence} confidence · {forecast.monthsOfData} months of data · Tradie spend is job-dependent — this is a guide, not a guarantee.</p>
    </div>
  {/if}

  <div class="voice-note">
    🔊 <strong>Read Aloud</strong> uses your phone's built-in voice — free, works offline. &nbsp;🤖 <strong>AI Q&amp;A</strong> (coming in premium) — ask questions, get spoken answers, capped at 10/day.
  </div>
</div>

<style>
  .head { position: sticky; top: 0; z-index: 2; background: #fff; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; padding: 16px; }
  .back-btn { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 8px; background: var(--bg, #F4F6F8); color: var(--navy); text-decoration: none; }
  .head h1 { flex: 1; font-size: 18px; margin: 0; }
  .hbtn { padding: 7px 11px; border-radius: 10px; border: 1.5px solid var(--border); background: #fff; color: var(--text2); font-size: 12px; font-weight: 600; cursor: pointer; }
  .hbtn.active { border-color: var(--red); color: var(--red); background: color-mix(in srgb, var(--red) 6%, white); }
  .body { padding: 16px; padding-bottom: 48px; display: flex; flex-direction: column; gap: 12px; }

  .bal-card { background: var(--navy); border-radius: 14px; padding: 16px; }
  .bal-tag { font-size: 10px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: var(--amber); }
  .bal-num { margin: 8px 0 0; font-size: 34px; font-weight: 800; color: #fff; letter-spacing: -0.02em; line-height: 1; }
  .bal-tiles { display: flex; gap: 8px; margin-top: 12px; }
  .bal-tile { flex: 1; background: rgba(255,255,255,0.08); border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }
  .bt-lbl { font-size: 9px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: rgba(255,255,255,0.5); }
  .bt-val { font-size: 15px; font-weight: 800; color: rgba(255,255,255,0.9); }
  .bt-val.red { color: #F87171; }
  .biggest { margin-top: 12px; padding: 10px 12px; background: rgba(255,255,255,0.08); border-radius: 10px; display: flex; justify-content: space-between; align-items: center; }
  .big-lbl { margin: 0; font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.5px; }
  .big-name { margin: 2px 0 0; font-size: 14px; font-weight: 700; color: #fff; }
  .big-amt { font-size: 18px; font-weight: 800; color: #fff; }

  .card { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  .label { font-size: 10px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: var(--text3); }
  .shock-head { margin: 10px 0 2px; font-size: 22px; font-weight: 800; line-height: 1.2; }
  .shock-sub { margin: 0 0 12px; font-size: 13px; color: var(--text2); }
  .meter { height: 8px; border-radius: 99px; background: var(--border); overflow: hidden; margin-bottom: 4px; }
  .meter-fill { height: 100%; border-radius: 99px; transition: width 0.5s ease; }
  .mini-lbl { margin: 12px 0 8px; font-size: 10px; font-weight: 600; color: var(--text3); text-transform: uppercase; letter-spacing: 0.5px; }
  .trend-row { display: flex; gap: 6px; }
  .trend-cell { flex: 1; background: var(--section-head, #F1F5F4); border-radius: 8px; padding: 8px 6px; text-align: center; }
  .trend-cell.current { border: 1.5px solid; }
  .tc-month { margin: 0; font-size: 9px; color: var(--text3); font-weight: 600; }
  .tc-dot { width: 10px; height: 10px; border-radius: 99px; margin: 4px auto; }
  .tc-score { margin: 0; font-size: 9px; font-weight: 700; }

  .trend-head { display: flex; align-items: baseline; gap: 10px; margin-top: 8px; }
  .th-big { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; }
  .th-sub { font-size: 13px; color: var(--text2); }
  .trend-text { margin: 6px 0 0; font-size: 13px; color: var(--text2); line-height: 1.4; }
  .spike-warn { margin-top: 10px; padding: 8px 12px; background: color-mix(in srgb, var(--red) 5%, white); border: 1px solid color-mix(in srgb, var(--red) 30%, white); border-radius: 8px; font-size: 12px; color: var(--red); font-weight: 600; }
  .chart-hold { margin-top: 12px; }

  .health-status { margin: 8px 0 0; font-size: 20px; font-weight: 800; line-height: 1.2; }
  .health-insight { margin: 4px 0 12px; font-size: 13px; color: var(--text2); }
  .score-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
  .sr-lbl { font-size: 11px; font-weight: 600; color: var(--text2); }
  .sr-val { font-size: 11px; font-weight: 800; }
  .health-bars { margin-top: 12px; }
  .hb-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .hb-name { font-size: 13px; flex: 1; font-weight: 600; }
  .hb-track { flex: 2; height: 6px; border-radius: 99px; background: var(--border); overflow: hidden; }
  .hb-fill { height: 100%; border-radius: 99px; }
  .hb-pct { font-size: 12px; font-weight: 700; min-width: 36px; text-align: right; }
  .action-box { margin-top: 10px; padding: 12px; background: color-mix(in srgb, var(--teal) 10%, white); border-radius: 10px; border: 1px solid color-mix(in srgb, var(--teal) 30%, white); font-size: 13px; font-weight: 600; color: var(--teal); }

  .fc-head { display: flex; align-items: baseline; gap: 10px; margin-top: 8px; }
  .fc-big { font-size: 32px; font-weight: 800; letter-spacing: -0.02em; }
  .fc-pct { font-size: 14px; font-weight: 700; }
  .fc-tiles { display: flex; gap: 8px; margin-top: 10px; }
  .fc-tile { flex: 1; background: var(--section-head, #F1F5F4); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 2px; }
  .fct-lbl { font-size: 9px; font-weight: 600; color: var(--text3); text-transform: uppercase; letter-spacing: 0.5px; }
  .fct-val { font-size: 15px; font-weight: 800; }
  .fc-note { margin: 10px 0 0; font-size: 11px; color: var(--text3); line-height: 1.4; }

  .voice-note { padding: 12px; background: #fff; border: 1px solid var(--border); border-radius: 12px; font-size: 11.5px; color: var(--text2); line-height: 1.5; }
</style>
