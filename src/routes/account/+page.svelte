<script>
  import { User, BadgeCheck, Mail, Building2, AtSign, Copy, LogOut, LogIn, CreditCard, ChevronRight } from '@lucide/svelte';
  import { getProfile } from '$lib/api.js';

  let loggedIn = $state(true);
  let profile = $state(null);
  let copied = $state(false);
  let section = $state('overview');

  // Mock subscription (will come from Supabase)
  const subscription = {
    tier: 'Free',
    invoicesThisMonth: 23,
    invoicesLimit: 50,
  };

  $effect(() => { getProfile().then((p) => (profile = p)); });

  function copyInbound() {
    navigator.clipboard?.writeText(profile.inbound_email);
    copied = true;
    setTimeout(() => (copied = false), 1800);
  }

  const tabs = [
    { key: 'overview', icon: '📖', label: 'How It Works' },
    { key: 'setup',    icon: '⚙️',  label: 'Add Invoices' },
    { key: 'tips',     icon: '💡',  label: 'Tips' },
    { key: 'deals',    icon: '🎯',  label: 'Deals' },
    { key: 'faq',      icon: '❓',  label: 'FAQ' },
  ];
</script>

{#if !loggedIn}
  <div class="signed-out">
    <div class="card so-card">
      <div class="so-ic"><LogOut size={22} /></div>
      <h1 class="so-title">Signed Out</h1>
      <p class="so-sub">Sign back in to track your invoices.</p>
      <button class="btn-primary btn-full" onclick={() => (loggedIn = true)}><LogIn size={16} /> Log In</button>
    </div>
  </div>

{:else if profile}
  <!-- ── User Profile ── -->
  <div class="prof-block">
    <div class="avatar">SC</div>
    <div class="prof-info">
      <p class="pname">{profile.full_name}</p>
      <p class="pemail">{profile.email}</p>
    </div>
  </div>

  <!-- ── Inbound Email ── -->
  <div class="card inbound-card">
    <p class="section-label">Your Inbound Email</p>
    <div class="inbound-row">
      <span class="inb-addr">{profile.inbound_email}</span>
      <button class="copy-btn" onclick={copyInbound} aria-label="Copy email address">
        <Copy size={15} color={copied ? 'var(--safe)' : 'var(--text2)'} />
        {#if copied}<span class="copy-confirm">Copied!</span>{/if}
      </button>
    </div>
    <p class="inb-hint">Give this to suppliers — they send invoices directly to your app.</p>
  </div>

  <!-- ── Subscription ── -->
  <h3 class="section-title">Subscription</h3>
  <div class="sub-grid">
    <div class="card sub-card">
      <p class="section-label">Current Tier</p>
      <p class="sub-val">{subscription.tier}</p>
    </div>
    <div class="card sub-card">
      <p class="section-label">This Month</p>
      <p class="sub-val">{subscription.invoicesThisMonth} / {subscription.invoicesLimit}</p>
    </div>
  </div>
  <div class="usage-bar-wrap">
    <div class="usage-bar">
      <div
        class="usage-fill"
        style="width:{(subscription.invoicesThisMonth / subscription.invoicesLimit) * 100}%;background:{subscription.invoicesThisMonth > subscription.invoicesLimit * 0.8 ? 'var(--amber)' : 'var(--safe)'}"
      ></div>
    </div>
  </div>
  <button class="btn-ghost btn-full upgrade-btn">
    <CreditCard size={16} /> Upgrade Plan <span class="coming-soon">Coming Soon</span>
  </button>

  <!-- ── Setup & Tips ── -->
  <h3 class="section-title">Setup & Tips</h3>

  <!-- Tabs -->
  <div class="tabs">
    {#each tabs as t}
      <button class="tab-btn" class:active={section === t.key} onclick={() => (section = t.key)}>
        {t.icon}
      </button>
    {/each}
  </div>
  <p class="tab-title">{tabs.find(t => t.key === section)?.label}</p>

  <!-- Tab Content -->
  {#if section === 'overview'}
    <div class="cards-col">
      <div class="card info-card">
        <p class="info-head">📨 Invoice Arrival</p>
        <p class="info-body">Every invoice from your suppliers lands here automatically — forwarded by you or sent directly. No more lost emails.</p>
      </div>
      <div class="card info-card">
        <p class="info-head">💰 Spend Visibility</p>
        <p class="info-body">See exactly what you're spending with each supplier by month, product, and trend. Spot when prices change.</p>
      </div>
      <div class="card info-card">
        <p class="info-head">🎯 Strike a Deal</p>
        <p class="info-body">Use your data at the counter. "I spent $18k with you — what's your best price?" Negotiate better terms.</p>
      </div>
      <div class="card info-card">
        <p class="info-head">📊 Track It</p>
        <p class="info-body">Manage deals in the app. Set a target and track if you hit it by month-end.</p>
      </div>
    </div>

  {:else if section === 'setup'}
    <div class="cards-col">
      <div class="card info-card green-card">
        <p class="info-head" style="color:var(--safe)">🟢 Auto-Send (Best)</p>
        <p class="info-body">Give suppliers your unique email above. They send invoices directly to your app — zero work from you.</p>
        <p class="info-hint">Best for: Tradelink, Reece, Middys, Bunnings Trade accounts</p>
      </div>
      <div class="card info-card amber-card">
        <p class="info-head" style="color:var(--amber)">🟠 Forward It (Reliable)</p>
        <p class="info-body">Supplier sends to your Gmail. You forward to your unique email. One extra step but bulletproof.</p>
        <p class="info-hint">Best for: suppliers who can't change their invoice email</p>
      </div>
      <div class="card info-card">
        <p class="info-head">💾 Manual Upload (Catch-All)</p>
        <p class="info-body">Lost invoice? Tap the <strong>+</strong> button. Upload a file or photo it with your camera.</p>
        <p class="info-hint">Best for: old paperwork, emergency invoices, printed receipts</p>
      </div>
      <div class="card info-card warn-card">
        <p class="info-head" style="color:var(--danger)">⚠️ Every Invoice Counts</p>
        <p class="info-body">One missing month = a blank in your history. The app learns from complete data — it's worth the effort.</p>
      </div>
    </div>

  {:else if section === 'tips'}
    <div class="cards-col">
      {#each [
        ['1. Upload Every Invoice', 'Even small ones. The app needs 6 months of complete history to spot patterns and negotiate.'],
        ['2. Check Suppliers Monthly', 'See which are trending up. If Tradelink is up 40% but your volume didn\'t change — something\'s wrong.'],
        ['3. Use Medal Modal at Counter', 'Show your top 3 suppliers by spend. Rep sees you\'re serious. Tap Show Supplier on the home screen.'],
        ['4. Strike Specific Deals', '"70% with Middys by July 31st." Track it. Text the rep. Accountability works.'],
        ['5. Watch Price Spikes', 'The app flags items up more than 5%. Instant negotiation lever at the counter.'],
        ['6. Be Consistent', '5 minutes a day = 6 months of data = thousands in negotiating power.'],
      ] as [head, body]}
        <div class="card info-card">
          <p class="info-head">{head}</p>
          <p class="info-body">{body}</p>
        </div>
      {/each}
    </div>

  {:else if section === 'deals'}
    <div class="cards-col">
      <div class="card info-card navy-card">
        <p class="info-body" style="color:#fff">A <strong>deal</strong> is a verbal agreement with a supplier. Set a target, pick an end date, track it in the app.</p>
      </div>
      <div class="card info-card">
        <p class="info-head">Example: Middys Electrical</p>
        <div class="example-box">
          <p><strong>Name:</strong> July Gold Challenge</p>
          <p><strong>Target:</strong> 70% of spend with Middys</p>
          <p><strong>End:</strong> July 31, 2026</p>
          <p><strong>Reward:</strong> Milwaukee Packout</p>
        </div>
        <p class="info-body">Track throughout July. Hit 70%? You won. Log it. Celebrate.</p>
      </div>
      <div class="card info-card">
        <p class="info-head">Why It Works</p>
        <ul class="info-list">
          <li><strong>Accountability</strong> — both you and rep invested</li>
          <li><strong>Leverage</strong> — "$1k more and I hit the target"</li>
          <li><strong>History</strong> — see which suppliers deliver on deals</li>
        </ul>
      </div>
      <div class="card info-card">
        <p class="info-head">How to Create One</p>
        <p class="info-body">Suppliers → pick a supplier → Negotiate Deal → fill in name, target, end date → Create. Done.</p>
      </div>
    </div>

  {:else if section === 'faq'}
    <div class="cards-col">
      {#each [
        ['Invoice didn\'t arrive?', 'Check spam. Not there? Upload manually with the + button. As a backup, ask the supplier to re-send.'],
        ['Does this replace Xero?', 'No. We\'re supplier spend visibility, not bookkeeping. You still need Xero for GST and reconciliation.'],
        ['Is my data safe?', 'Yes. Encrypted and stored securely. Never sold, never shared with suppliers.'],
        ['How often to upload?', 'Ideally weekly. If auto-forwarding is set up, it\'s automatic — no work from you.'],
        ['Where are my old deals?', 'Suppliers → pick one → scroll to Agreement History. Won, lost, and active all listed.'],
        ['Invoice hard to read?', 'The app tries to read it with AI. If it fails, tap into the invoice and manually edit the numbers.'],
      ] as [q, a]}
        <div class="card info-card">
          <p class="info-head">{q}</p>
          <p class="info-body">{a}</p>
        </div>
      {/each}
    </div>
  {/if}

  <!-- ── Log Out ── -->
  <div class="logout-wrap">
    <button class="btn-ghost btn-full logout-btn" onclick={() => (loggedIn = false)}>
      <LogOut size={16} /> Log Out
    </button>
  </div>
{/if}

<style>
  /* ── Profile block ── */
  .prof-block { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
  .avatar { width: 56px; height: 56px; border-radius: 12px; background: var(--navy); color: #fff; display: grid; place-items: center; font-size: 18px; font-weight: 700; flex-shrink: 0; }
  .pname { margin: 0; font-size: 15px; font-weight: 700; }
  .pemail { margin: 2px 0 0; font-size: 12px; color: var(--text2); }

  /* ── Inbound email ── */
  .inbound-card { padding: 12px; margin-bottom: 16px; }
  .section-label { margin: 0 0 6px; font-size: 10px; font-weight: 700; color: var(--text3); text-transform: uppercase; letter-spacing: 0.5px; }
  .inbound-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .inb-addr { font-size: 13px; font-family: ui-monospace, monospace; font-weight: 600; color: var(--navy); word-break: break-all; flex: 1; }
  .copy-btn { display: inline-flex; align-items: center; gap: 5px; padding: 6px 10px; border-radius: 6px; border: 1.5px solid var(--border); background: #fff; cursor: pointer; flex-shrink: 0; }
  .copy-confirm { font-size: 11px; font-weight: 600; color: var(--safe); white-space: nowrap; }
  .inb-hint { margin: 8px 0 0; font-size: 11.5px; color: var(--text3); line-height: 1.4; }

  /* ── Subscription ── */
  .section-title { font-size: 14px; font-weight: 700; margin: 0 0 10px; }
  .sub-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
  .sub-card { padding: 12px; }
  .sub-val { margin: 6px 0 0; font-size: 18px; font-weight: 800; color: var(--navy); }
  .usage-bar-wrap { margin-bottom: 10px; }
  .usage-bar { height: 6px; border-radius: 99px; background: var(--border); overflow: hidden; }
  .usage-fill { height: 100%; border-radius: 99px; transition: width 0.4s; }
  .upgrade-btn { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 20px; }
  .coming-soon { font-size: 10px; font-weight: 600; color: var(--text3); background: var(--border); padding: 2px 6px; border-radius: 4px; }

  /* ── Tabs ── */
  .tabs { display: flex; gap: 4px; background: var(--section-head); border-radius: 10px; padding: 4px; margin-bottom: 10px; overflow-x: auto; }
  .tab-btn { flex: 1; padding: 8px 0; font-size: 16px; border: none; border-radius: 7px; background: transparent; cursor: pointer; transition: background 0.15s; }
  .tab-btn.active { background: var(--navy); }
  .tab-title { margin: 0 0 12px; font-size: 14px; font-weight: 700; color: var(--text); }

  /* ── Info cards ── */
  .cards-col { display: flex; flex-direction: column; gap: 10px; }
  .info-card { padding: 14px; }
  .info-head { margin: 0 0 5px; font-size: 13.5px; font-weight: 700; }
  .info-body { margin: 0; font-size: 12.5px; color: var(--text2); line-height: 1.5; }
  .info-hint { margin: 6px 0 0; font-size: 11px; color: var(--text3); font-style: italic; }
  .info-list { margin: 4px 0 0; padding-left: 18px; font-size: 12.5px; color: var(--text2); line-height: 1.7; }
  .green-card { background: color-mix(in srgb, var(--safe) 6%, white); border-color: color-mix(in srgb, var(--safe) 25%, white); }
  .amber-card { background: color-mix(in srgb, var(--amber) 6%, white); border-color: color-mix(in srgb, var(--amber) 25%, white); }
  .warn-card { border-left: 4px solid var(--danger); }
  .navy-card { background: var(--navy); border-color: var(--navy); }
  .example-box { background: var(--section-head); border-radius: 8px; padding: 10px 12px; margin: 8px 0; font-size: 12.5px; line-height: 1.7; }
  .example-box p { margin: 0; }

  /* ── Log out ── */
  .logout-wrap { margin-top: 24px; padding-top: 14px; border-top: 1px solid var(--border); padding-bottom: 8px; }
  .logout-btn { color: var(--danger) !important; border-color: var(--danger) !important; display: flex; align-items: center; justify-content: center; gap: 8px; }

  /* ── Signed-out state ── */
  .signed-out { min-height: 60vh; display: grid; place-items: center; }
  .so-card { width: 100%; max-width: 360px; padding: 24px; text-align: center; }
  .so-ic { width: 48px; height: 48px; margin: 0 auto; border-radius: 12px; display: grid; place-items: center; background: color-mix(in srgb, var(--navy) 8%, white); color: var(--navy); }
  .so-title { margin: 16px 0 4px; font-size: 20px; }
  .so-sub { margin: 0 0 20px; font-size: 13.5px; color: var(--text2); }
</style>
