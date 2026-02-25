/**
 * wishlist-count.js
 *
 * Defines the <wishlist-count> web component.
 * Load this in theme.liquid so the count badge is available on every page.
 *
 * Usage:
 *   <!-- In theme.liquid <head> or before </body> -->
 *   <script src="{{ 'wishlist-count.js' | asset_url }}" defer></script>
 *
 *   <!-- Anywhere in your markup (header, nav, etc.) -->
 *   <wishlist-count></wishlist-count>
 *
 * Behaviour:
 *   • On load: fetches the real count from the server (logged-in) or
 *     reads localStorage (guest).
 *   • Listens to `wishlist:updated` events dispatched by wishlist-button.js
 *     and increments / decrements the count in real time.
 *   • Renders as plain text "(3)". Hidden automatically when count is 0.
 *   • Multiple <wishlist-count> elements on the same page all stay in sync.
 *
 * Styling (add to your theme CSS or wishlist-page.css):
 *   wishlist-count[hidden] { display: none; }
 */

(function () {
  'use strict';

  const IS_LOGGED_IN  = window.WishlistConfig?.isLoggedIn  ?? false;
  const CUSTOMER_ID   = window.WishlistConfig?.customerId  ?? null;
  const APP_PROXY_URL = window.WishlistConfig?.appProxyUrl ?? '';
  const STORAGE_KEY   = 'shopify_wishlist';

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function getLocalCount() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').length;
    } catch {
      return 0;
    }
  }

  async function fetchServerCount() {
    try {
      const res = await fetch(`${APP_PROXY_URL}/api/v1/wishlist/integration/list`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: `gid://shopify/Customer/${CUSTOMER_ID}`,
          limit:      1,      // We only need the totalCount, not the items
          cursor:     null,
          idsOnly:    true    // Lighter payload — only IDs, no product data
        })
      });

      if (!res.ok) return 0;

      const data = await res.json();

      // Prefer totalCount if the API returns it; fall back to items length
      return data.totalCount ?? data.items?.length ?? 0;
    } catch {
      return 0;
    }
  }

  // ─── Shared count bus ────────────────────────────────────────────────────────
  // Stores the resolved count once so multiple <wishlist-count> elements
  // on the same page don't each fire a separate API request.

  let resolvedCount = null;
  let pendingFetch  = null;

  function getCountOnce() {
    if (resolvedCount !== null) return Promise.resolve(resolvedCount);

    if (!pendingFetch) {
      pendingFetch = (IS_LOGGED_IN ? fetchServerCount() : Promise.resolve(getLocalCount()))
        .then(n => {
          resolvedCount = n;
          return n;
        });
    }

    return pendingFetch;
  }

  // Reset the cached count when a wishlist:updated event fires,
  // so the next mount (e.g. after a page navigation) re-fetches.
  document.addEventListener('wishlist:updated', () => {
    // Don't reset resolvedCount — we update it incrementally via delta instead.
  });

  // ─── <wishlist-count> Web Component ──────────────────────────────────────────

  class WishlistCount extends HTMLElement {
    connectedCallback() {
      this._count = 0;
      this._render();

      // Initialise count from cache or fetch
      getCountOnce().then(n => this._setCount(n));

      // React to add / remove events from wishlist-button.js
      document.addEventListener('wishlist:updated', (e) => {
        const delta = e.detail.status === 'added' ? 1 : -1;
        const next  = Math.max(0, this._count + delta);

        // Keep the shared cache in sync so other elements get the right value
        resolvedCount = Math.max(0, (resolvedCount ?? this._count) + delta);

        this._setCount(next);
      });
    }

    /**
     * Called externally by wishlist-page.js after it knows the exact count.
     * Keeps all <wishlist-count> elements in sync when the page loads.
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
