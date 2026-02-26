/**
 * wishlist-count.js
 *
 * Defines the <wishlist-count> web component.
 * Load globally in theme.liquid (before </body>).
 *
 * Usage — markup:
 *   <wishlist-count></wishlist-count>
 *
 * Usage — call from anywhere:
 *   renderWishlistCounter();             // invalidate + re-fetch
 *   renderWishlistCounter({ count: 5 }); // set directly, no fetch
 */

(function () {
  'use strict';

  const IS_LOGGED_IN  = window.WishlistConfig?.isLoggedIn  ?? false;
  const CUSTOMER_ID   = window.WishlistConfig?.customerId  ?? null;
  const APP_PROXY_URL = window.WishlistConfig?.appProxyUrl ?? '';
  const STORAGE_KEY   = 'shopify_wishlist';

  // Horizon ThemeEvents.cartUpdate — reads from window if exposed, falls back
  // to the known Horizon event string 'cart:updated'.
  const CART_UPDATE_EVENT = window.ThemeEvents?.cartUpdate ?? 'cart:updated';

  // ─── Shared count state ───────────────────────────────────────────────────────
  // Single fetch shared across all <wishlist-count> instances — no duplicate reqs.

  let resolvedCount = null;
  let pendingFetch  = null;

  function invalidateCount() {
    resolvedCount = null;
    pendingFetch  = null;
  }

  function getCountOnce() {
    if (resolvedCount !== null) return Promise.resolve(resolvedCount);
    if (!pendingFetch) {
      pendingFetch = (IS_LOGGED_IN ? fetchServerCount() : Promise.resolve(getLocalCount()))
        .then(n => { resolvedCount = n; return n; });
    }
    return pendingFetch;
  }

  // ─── Count sources ────────────────────────────────────────────────────────────

  function getLocalCount() {
    try   { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').length; }
    catch { return 0; }
  }

  async function fetchServerCount() {
    if (!CUSTOMER_ID || !APP_PROXY_URL) return 0;
    try {
      const res = await fetch(`${APP_PROXY_URL}/api/v1/wishlist/integration/list`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: `gid://shopify/Customer/${CUSTOMER_ID}`,
          limit:   50,
          cursor:  null,
          idsOnly: false
        })
      });
      if (!res.ok) return 0;
      const data = await res.json();
      return data.totalCount ?? data.items?.length ?? 0;
    } catch {
      return 0;
    }
  }

  // ─── Broadcast helpers ────────────────────────────────────────────────────────

  // Push an exact count to every mounted <wishlist-count> element.
  function broadcastCount(n) {
    document.querySelectorAll('wishlist-count').forEach(el => {
      if (typeof el._setCount === 'function') el._setCount(n);
    });
  }

  // Apply a +1 / -1 delta without re-fetching.
  function broadcastDelta(delta) {
    const next = Math.max(0, (resolvedCount ?? 0) + delta);
    resolvedCount = next;
    broadcastCount(next);
  }

  // ─── renderWishlistCounter (public API) ───────────────────────────────────────

  async function renderWishlistCounter(options) {
    if (options?.count !== undefined) {
      resolvedCount = Math.max(0, options.count);
      broadcastCount(resolvedCount);
      return;
    }
    invalidateCount();
    const n = await getCountOnce();
    broadcastCount(n);
  }

  window.renderWishlistCounter = renderWishlistCounter;

  // ─── Module-level event listeners ────────────────────────────────────────────
  //
  // IMPORTANT: These are the ONLY places wishlist:updated is handled for counting.
  // The <wishlist-count> connectedCallback does NOT add its own wishlist:updated
  // listener — that was the source of the double-count bug where adding one item
  // showed a count of 2.
  //
  // Flow on add/remove:
  //   wishlist-button.js dispatches wishlist:updated
  //   → broadcastDelta(±1) updates resolvedCount
  //   → broadcastCount(n) calls _setCount(n) on every <wishlist-count> element

  document.addEventListener('wishlist:updated', (e) => {
    const delta = e.detail.status === 'added' ? 1 : -1;
    broadcastDelta(delta);
  });

  // Re-fetch on cart updates (keeps badge in sync after Horizon cart re-renders).
  document.addEventListener(CART_UPDATE_EVENT, () => {
    renderWishlistCounter();
  });

  // ─── <wishlist-count> Web Component ──────────────────────────────────────────

  class WishlistCount extends HTMLElement {
    connectedCallback() {
      this._count = 0;
      this._render();

      // Initialise from shared fetch/cache — no duplicate API call.
      getCountOnce().then(n => this._setCount(n));

      // NO wishlist:updated listener here.
      // broadcastDelta() → broadcastCount() → _setCount() handles all updates.
      // Adding a listener here too was the double-count bug.
    }

    /** Called by broadcastCount() and by wishlist-page.js with the real total. */
    _setCount(n) {
      this._count = n;
      this._render();
    }

    _render() {
      if (this._count > 0) {
        this.textContent = `${this._count}`;
        this.removeAttribute('hidden');
      } else {
        this.textContent = '';
        this.setAttribute('hidden', '');
      }
    }
  }

  if (!customElements.get('wishlist-count')) {
    customElements.define('wishlist-count', WishlistCount);
  }

})();