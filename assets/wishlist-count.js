/**
 * wishlist-count.js
 *
 * Defines the <wishlist-count> web component.
 * Load this in theme.liquid so the count badge is available on every page.
 *
 * Usage — theme.liquid (before </body>):
 *   <script src="{{ 'wishlist-count.js' | asset_url }}" defer></script>
 *
 * Usage — markup (nav, header, etc.):
 *   <wishlist-count></wishlist-count>
 *
 * Usage — call from anywhere to force a re-render:
 *   renderWishlistCounter();            // re-fetches count and updates all badges
 *   renderWishlistCounter({ count: 5 }); // skip fetch, set a known count directly
 *
 * Horizon ThemeEvents integration:
 *   This file listens to ThemeEvents.cartUpdate automatically. Since it runs as
 *   a plain <script> asset (not an ES module), it cannot import from @theme/events
 *   directly. Instead it reads the event name from window.ThemeEvents if the theme
 *   has already set it, then falls back to the known Horizon event string.
 *
 *   If you need to bind it yourself in your own theme JS module:
 *     import { ThemeEvents } from '@theme/events';
 *     document.addEventListener(ThemeEvents.cartUpdate, () => renderWishlistCounter());
 *
 * Behaviour:
 *   • On load: fetches count from server (logged-in) or reads localStorage (guest).
 *   • Listens to wishlist:updated events from wishlist-button.js — increments/decrements.
 *   • Listens to ThemeEvents.cartUpdate — re-fetches the real count from the server.
 *   • Multiple <wishlist-count> elements on the same page all stay in sync.
 *   • Hidden automatically when count is 0.
 *
 * Styling:
 *   wishlist-count[hidden] { display: none; }
 */

(function () {
  'use strict';

  const IS_LOGGED_IN  = window.WishlistConfig?.isLoggedIn  ?? false;
  const CUSTOMER_ID   = window.WishlistConfig?.customerId  ?? null;
  const APP_PROXY_URL = window.WishlistConfig?.appProxyUrl ?? '';
  const STORAGE_KEY   = 'shopify_wishlist';

  // ─── Resolve ThemeEvents.cartUpdate event name ───────────────────────────────
  //
  // Horizon theme exposes ThemeEvents as an ES module export — not on window —
  // so we can't read it directly in a plain <script> tag.
  //
  // Options (use whichever fits your setup):
  //
  //   A) Horizon exposes the value on window via theme.liquid:
  //        window.ThemeEvents = { cartUpdate: 'cart:updated' };
  //      This file will pick it up automatically from window.ThemeEvents.
  //
  //   B) You import this in a module and call it yourself:
  //        import { ThemeEvents } from '@theme/events';
  //        document.addEventListener(ThemeEvents.cartUpdate, () => renderWishlistCounter());
  //
  //   C) Just rely on the fallback — Horizon's actual event string is 'cart:updated'.
  //
  // Known Horizon event strings (as of 2024 theme versions):
  //   cartUpdate  → 'cart:updated'
  //
  const CART_UPDATE_EVENT =
    window.ThemeEvents?.cartUpdate   // Option A: set on window by theme.liquid
    ?? 'cart:updated';               // Option C: known Horizon fallback

  // ─── Shared count state ───────────────────────────────────────────────────────
  // One fetch shared across all <wishlist-count> instances on the page.
  // Reset by calling invalidateCount() so the next getCountOnce() re-fetches.

  let resolvedCount = null;
  let pendingFetch  = null;

  function invalidateCount() {
    resolvedCount = null;
    pendingFetch  = null;
  }

  function getCountOnce() {
    if (resolvedCount !== null) return Promise.resolve(resolvedCount);

    if (!pendingFetch) {
      const source = IS_LOGGED_IN
        ? fetchServerCount()
        : Promise.resolve(getLocalCount());

      pendingFetch = source.then(n => {
        resolvedCount = n;
        return n;
      });
    }

    return pendingFetch;
  }

  // ─── Count sources ────────────────────────────────────────────────────────────

  function getLocalCount() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').length;
    } catch {
      return 0;
    }
  }

  async function fetchServerCount() {
    if (!CUSTOMER_ID || !APP_PROXY_URL) return 0;
    try {
      const res = await fetch(`${APP_PROXY_URL}/api/v1/wishlist/integration/list`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: `gid://shopify/Customer/${CUSTOMER_ID}`,
          limit:      1,
          cursor:     null,
          idsOnly:    true
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
  // Push a count value to every mounted <wishlist-count> element.

  function broadcastCount(n) {
    document.querySelectorAll('wishlist-count').forEach(el => {
      if (typeof el._setCount === 'function') el._setCount(n);
    });
  }

  function broadcastDelta(delta) {
    const next = Math.max(0, (resolvedCount ?? 0) + delta);
    resolvedCount = next;
    broadcastCount(next);
  }

  // ─── renderWishlistCounter ────────────────────────────────────────────────────
  /**
   * Public function. Forces all <wishlist-count> elements to re-render.
   *
   * Called automatically on:
   *   • ThemeEvents.cartUpdate  (Horizon cart drawer updates)
   *   • wishlist:updated        (add / remove from wishlist-button.js)
   *
   * Can also be called manually from anywhere:
   *   renderWishlistCounter();            // re-fetches from server/localStorage
   *   renderWishlistCounter({ count: 3 }); // set a specific count, skip fetch
   *
   * @param {Object}  [options]
   * @param {number}  [options.count]   If provided, sets the count directly without fetching.
   */
  async function renderWishlistCounter(options) {
    if (options?.count !== undefined) {
      // Caller knows the exact count — apply directly
      resolvedCount = Math.max(0, options.count);
      broadcastCount(resolvedCount);
      return;
    }

    // Invalidate cache and re-fetch
    invalidateCount();
    const n = await getCountOnce();
    broadcastCount(n);
  }

  // Expose globally so it can be called from anywhere (theme JS, app proxy, etc.)
  window.renderWishlistCounter = renderWishlistCounter;

  // ─── Event listeners ──────────────────────────────────────────────────────────

  // wishlist:updated — fired by wishlist-button.js on add/remove
  // Use incremental delta (no re-fetch needed — we know direction)
  document.addEventListener('wishlist:updated', (e) => {
    const delta = e.detail.status === 'added' ? 1 : -1;
    broadcastDelta(delta);
  });

  // ThemeEvents.cartUpdate — fired by Horizon theme when cart changes
  // Re-fetch from server to get the real count (cart changes don't affect
  // wishlist count directly, but this keeps the badge in sync after cart-level
  // page re-renders that might remount the component with a stale count).
  document.addEventListener(CART_UPDATE_EVENT, () => {
    renderWishlistCounter();
  });

  // ─── <wishlist-count> Web Component ──────────────────────────────────────────

  class WishlistCount extends HTMLElement {
    connectedCallback() {
      this._count = 0;
      this._render();

      // Kick off count initialisation (uses shared fetch — no duplicate requests)
      getCountOnce().then(n => this._setCount(n));

      // Individual element also responds to wishlist:updated so it stays
      // in sync even if broadcastCount() hasn't been called yet (race condition)
      document.addEventListener('wishlist:updated', (e) => {
        const delta = e.detail.status === 'added' ? 1 : -1;
        this._setCount(Math.max(0, this._count + delta));
      });
    }

    /**
     * Set an exact count. Called by broadcastCount() and by wishlist-page.js
     * once it has loaded the full wishlist and knows the real total.
     */
    _setCount(n) {
      this._count = n;
      this._render();
    }

    _render() {
      if (this._count > 0) {
        this.textContent = `(${this._count})`;
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
