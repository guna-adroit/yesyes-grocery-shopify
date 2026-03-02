(function () {
  'use strict';

  const IS_LOGGED_IN  = window.WishlistConfig?.isLoggedIn  ?? false;
  const CUSTOMER_ID   = window.WishlistConfig?.customerId  ?? null;
  const APP_PROXY_URL = window.WishlistConfig?.appProxyUrl ?? '';

  const STORAGE_KEY      = 'shopify_wishlist';
  const STORAGE_META_KEY = 'shopify_wishlist_meta';
  const SYNC_FLAG_KEY    = 'shopify_wishlist_synced'; // sessionStorage — clears on tab close

  // Only run for logged-in users
  if (!IS_LOGGED_IN || !CUSTOMER_ID) return;

  // Only run once per login session
  if (sessionStorage.getItem(SYNC_FLAG_KEY)) return;

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  function toGid(type, id) {
    return `gid://shopify/${type}/${id}`;
  }

  function getLocalIds() {
    try   { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  function clearLocalWishlist() {
    try { localStorage.removeItem(STORAGE_KEY); }      catch {}
    try { localStorage.removeItem(STORAGE_META_KEY); } catch {}
  }

  function markSynced() {
    try { sessionStorage.setItem(SYNC_FLAG_KEY, '1'); } catch {}
  }

  // ─── API helpers ──────────────────────────────────────────────────────────────

  /**
   * Check which of the given IDs are already in the customer's server wishlist.
   * Returns a Set of IDs that are already present (no need to add them again).
   */
  async function getAlreadyOnServer(productIds) {
    try {
      const res = await fetch(`${APP_PROXY_URL}/api/v1/wishlist/integration/verify`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          customerId: toGid('Customer', CUSTOMER_ID),
          productIds
        })
      });
      if (!res.ok) throw new Error(`Verify failed ${res.status}`);
      const data = await res.json();

      const present = new Set();
      productIds.forEach(id => {
        if (data[toGid('Product', id)] === true) present.add(id);
      });
      return present;
    } catch (e) {
      console.error('[WishlistSync] verify error:', e);
      return new Set(); // assume none present — safe to attempt add for all
    }
  }

  /**
   * Add a single product to the server wishlist.
   * Uses the toggle endpoint — if the product is already there it toggles OFF,
   * so we only call this for IDs confirmed missing by getAlreadyOnServer().
   *
   * Returns 'added' | 'removed' | null
   */
  async function addToServer(productId) {
    try {
      const res = await fetch(`${APP_PROXY_URL}/api/v1/wishlist/integration/toggle`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          customerId: toGid('Customer', CUSTOMER_ID),
          productId:  toGid('Product', productId)
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Toggle failed ${res.status}`);
      return data.status; // 'added' | 'removed'
    } catch (e) {
      console.error(`[WishlistSync] failed to add product ${productId}:`, e);
      return null;
    }
  }

  // ─── Toast notification ───────────────────────────────────────────────────────

  function showSyncToast(count) {
    document.querySelector('.wishlist-toast')?.remove();

    const toast = document.createElement('div');
    toast.className = 'wishlist-toast added';
    toast.innerHTML = `
      <div class="wishlist-toast-inner">
        <div class="wishlist-toast-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
            <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z"/>
          </svg>
        </div>
        <div class="wishlist-toast-content">
          <strong>Wishlist synced!</strong>
          <p>${count} item${count !== 1 ? 's' : ''} saved to your account.</p>
        </div>
      </div>`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.replace('show', 'hide');
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }

  // ─── Main sync ────────────────────────────────────────────────────────────────

  async function syncGuestWishlistToServer() {
    const localIds = getLocalIds();

    // Nothing in localStorage — mark done and exit
    if (!localIds.length) {
      markSynced();
      return;
    }

    console.debug(`[WishlistSync] Found ${localIds.length} local item(s) to sync.`);

    // 1. Find which IDs are already on the server
    const alreadyPresent = await getAlreadyOnServer(localIds);
    const toAdd          = localIds.filter(id => !alreadyPresent.has(id));

    console.debug(`[WishlistSync] ${alreadyPresent.size} already on server, ${toAdd.length} to add.`);

    // 2. Add missing items sequentially to avoid race conditions on the server
    //    (toggle endpoint is not idempotent — parallel calls could toggle same item twice)
    let syncedCount = 0;
    for (const productId of toAdd) {
      const status = await addToServer(productId);
      if (status === 'added') syncedCount++;
    }

    // 3. Clear localStorage — server is now the source of truth
    clearLocalWishlist();
    markSynced();

    console.debug(`[WishlistSync] Sync complete. ${syncedCount} item(s) added to server.`);

    // 4. Notify rest of the app
    const totalSynced = syncedCount + alreadyPresent.size; // all local items are now on server
    document.dispatchEvent(new CustomEvent('wishlist:synced', {
      detail: {
        syncedCount:  syncedCount,     // items newly added
        totalCount:   totalSynced,     // total items now in server wishlist from this session
        skippedCount: alreadyPresent.size  // items already present, not re-added
      }
    }));

    // 5. Re-render the count badge with the real server count
    if (typeof window.renderWishlistCounter === 'function') {
      window.renderWishlistCounter();
    }

    // 6. Show a toast if any items were synced (newly added or already present)
    if (totalSynced > 0) {
      showSyncToast(totalSynced);
    }
  }

  // ─── Run after DOM ready ──────────────────────────────────────────────────────
  // Use a short delay so wishlist-button.js / wishlist-count.js finish their
  // own init (verify calls, count fetch) before sync overwrites localStorage.

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(syncGuestWishlistToServer, 300));
  } else {
    setTimeout(syncGuestWishlistToServer, 300);
  }

})();