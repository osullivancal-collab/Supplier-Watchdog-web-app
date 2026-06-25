<script>
  import '../app.css';
  import { page } from '$app/stores';
  import { afterNavigate } from '$app/navigation';
  import { House, ReceiptText, Package, Truck, User, TriangleAlert, Plus } from '@lucide/svelte';
  import UploadSheet from '$lib/components/UploadSheet.svelte';

  let { children } = $props();

  let contentEl = $state(null);
  // Reset scroll to top on every navigation — otherwise the internally-scrolling
  // .content element preserves position and pages open mid-scroll.
  afterNavigate(() => {
    if (contentEl) contentEl.scrollTop = 0;
  });

  const nav = [
    { href: '/', label: 'Home', icon: House },
    { href: '/invoices', label: 'Bills', icon: ReceiptText },
    { href: '/materials', label: 'Materials', icon: Package },
    { href: '/wholesalers', label: 'Suppliers', icon: Truck },
    { href: '/account', label: 'Account', icon: User }
  ];

  let path = $derived($page.url.pathname);
  const isActive = (href) => (href === '/' ? path === '/' : path.startsWith(href));

  let showUpload = $state(false);
  const inboundEmail = 'u_a1b2c3@in.watchdog.app';
</script>

<div class="app">
  <!-- Desktop sidebar -->
  <aside class="sidebar">
    <div class="brand">
      <div class="logo"><TriangleAlert size={18} /></div>
      <div class="brand-txt">
        <p class="b1">Wholesaler</p>
        <p class="b2">Watchdog</p>
      </div>
    </div>
    <nav class="side-nav">
      {#each nav as item}
        <a href={item.href} class="side-link" class:active={isActive(item.href)}>
          <item.icon size={16} />{item.label}
        </a>
      {/each}
    </nav>
    <!-- Upload shortcut in sidebar -->
    <button class="side-upload" onclick={() => (showUpload = true)}>
      <Plus size={16} /> Add a Bill
    </button>
    <div class="side-foot">
      <p class="f1">Site Crew Pty Ltd</p>
      <p class="f2">ABN 12 345 678 901</p>
    </div>
  </aside>

  <!-- Main content -->
  <main class="content" bind:this={contentEl}>
    {@render children()}
  </main>

  <!-- Mobile bottom bar with floating + upload button -->
  <nav class="tabbar">
    {#each nav.slice(0, 2) as item}
      <a href={item.href} class="tab" class:active={isActive(item.href)}>
        <item.icon size={20} /><span>{item.label}</span>
      </a>
    {/each}
    <button class="upload-fab" onclick={() => (showUpload = true)} aria-label="Add a bill">
      <Plus size={26} strokeWidth={2.5} />
    </button>
    {#each nav.slice(3, 5) as item}
      <a href={item.href} class="tab" class:active={isActive(item.href)}>
        <item.icon size={20} /><span>{item.label}</span>
      </a>
    {/each}
  </nav>

  {#if showUpload}
    <UploadSheet {inboundEmail} onClose={() => (showUpload = false)} />
  {/if}
</div>

<style>
  .app { display: flex; min-height: 100vh; }

  .sidebar {
    width: 220px; background: var(--navy); flex-shrink: 0;
    display: flex; flex-direction: column;
    position: sticky; top: 0; height: 100vh;
  }
  .brand { padding: 20px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .logo { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; background: var(--amber); color: var(--navy); }
  .b1 { margin: 0; font-size: 14px; font-weight: 700; color: #fff; line-height: 1.1; }
  .b2 { margin: 0; font-size: 14px; font-weight: 700; color: var(--amber); line-height: 1.1; }
  .side-nav { padding: 10px; flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .side-link {
    display: flex; align-items: center; gap: 12px; padding: 11px 12px;
    border-radius: 10px; font-size: 13.5px; font-weight: 600;
    color: rgba(255,255,255,0.6);
  }
  .side-link.active { background: rgba(255,255,255,0.12); color: #fff; }
  .side-foot { padding: 16px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 11.5px; color: rgba(255,255,255,0.5); }
  .f1 { margin: 0; font-weight: 600; color: rgba(255,255,255,0.8); }
  .f2 { margin: 0; }
  .side-upload {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    margin: 0 10px 10px; padding: 10px; border-radius: 10px; border: none; cursor: pointer;
    background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.8);
    font-size: 13px; font-weight: 600;
  }

  .content { flex: 1; min-width: 0; padding: 16px; padding-bottom: 110px; max-width: 640px; width: 100%; margin: 0 auto; }

  .tabbar {
    position: fixed; bottom: 0; left: 0; right: 0; height: 64px;
    background: var(--white); border-top: 1px solid var(--border);
    display: none; align-items: center; justify-content: space-around;
    padding-bottom: env(safe-area-inset-bottom); z-index: 50;
  }
  .tab {
    flex: 1; height: 100%; min-height: 44px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
    color: var(--text3); font-size: 10px; font-weight: 600;
  }
  .tab.active { color: var(--navy); }
  .upload-fab {
    width: 64px; height: 64px; border-radius: 99px; flex-shrink: 0;
    border: 4px solid var(--white);
    background: linear-gradient(135deg, var(--teal), var(--navy));
    color: #fff; display: grid; place-items: center; margin-top: -28px;
    box-shadow: 0 4px 14px rgba(0,0,0,0.22); cursor: pointer;
  }

  @media (max-width: 900px) {
    .sidebar { display: none; }
    .tabbar { display: flex; }
  }
</style>
