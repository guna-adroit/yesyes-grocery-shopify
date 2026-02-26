/**
 * wishlist-button.js
 *
 * Wishlist toggle buttons for product cards and product pages.
 * Works for logged-in users (server API) and guests (localStorage).
 *
 * ─── localStorage keys ────────────────────────────────────────────────────────
 *  shopify_wishlist       → string[]  product IDs  e.g. ["123", "456"]
 *  shopify_wishlist_meta  → object    { [id]: { handle, title, image } }
 *
 * ─── Required attributes on <wishlist-button> ────────────────────────────────
 *  data-product-id      ="{{ product.id }}"
 *  data-product-handle  ="{{ product.handle }}"
 *  data-product-title   ="{{ product.title | escape }}"
 *  data-product-image   ="{{ product.featured_image | image_url: width: 400 }}"
 */

(function () {
  'use strict';

  const WISHLIST_STORAGE_KEY = 'shopify_wishlist';
  const WISHLIST_META_KEY    = 'shopify_wishlist_meta';

  const IS_LOGGED_IN  = window.WishlistConfig?.isLoggedIn  ?? false;
  const CUSTOMER_ID   = window.WishlistConfig?.customerId  ?? null;
  const APP_PROXY_URL = window.WishlistConfig?.appProxyUrl ?? '';

  // ─── localStorage helpers ────────────────────────────────────────────────────

  function getLocalWishlist() {
    try   { return JSON.parse(localStorage.getItem(WISHLIST_STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  function saveLocalWishlist(list) {
    try   { localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(list)); }
    catch (e) { console.error('[Wishlist] saveLocalWishlist:', e); }
  }

  function getLocalMeta() {
    try   { return JSON.parse(localStorage.getItem(WISHLIST_META_KEY) || '{}'); }
    catch { return {}; }
  }

  function saveLocalMeta(meta) {
    try   { localStorage.setItem(WISHLIST_META_KEY, JSON.stringify(meta)); }
    catch (e) { console.error('[Wishlist] saveLocalMeta:', e); }
  }

  function saveProductMeta(productId, handle, title, image) {
    if (!productId || !handle) return;
    const meta = getLocalMeta();
    meta[productId] = { handle, title, image };
    saveLocalMeta(meta);
  }

  function removeProductMeta(productId) {
    const meta = getLocalMeta();
    delete meta[productId];
    saveLocalMeta(meta);
  }

  /**
   * Passive legacy migration.
   * If this product is in the wishlist but has no meta entry, write it now
   * using data attributes from the element. Runs on every button mount so
   * legacy IDs (added before handle-caching was introduced) heal passively
   * as the user browses the store.
   */
  function backfillMetaIfNeeded(productId, handle, title, image) {
    if (IS_LOGGED_IN) return;
    if (!productId || !handle) return;
    if (!getLocalWishlist().includes(productId)) return;
    const meta = getLocalMeta();
    if (meta[productId]?.handle) return;
    meta[productId] = { handle, title, image };
    saveLocalMeta(meta);
  }

  // ─── Utilities ────────────────────────────────────────────────────────────────

  function toGid(type, id) {
    return `gid://shopify/${type}/${id}`;
  }

  function dispatchWishlistEvent(productId, status) {
    document.dispatchEvent(new CustomEvent('wishlist:updated', {
      detail: { productId, status }
    }));
  }

  function showWishlistToast(title, image, type) {
    document.querySelector('.wishlist-toast')?.remove();

    const toast = document.createElement('div');
    toast.className = `wishlist-toast ${type}`;
    toast.innerHTML = `
      <div class="wishlist-toast-inner">
        <img src="${image}" alt="${title}" />
        <div class="wishlist-toast-content">
          <strong>${title}</strong>
          <p>has been ${type} ${type === 'added' ? 'to' : 'from'} your Wishlist.</p>
        </div>
      </div>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.replace('show', 'hide');
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  // ─── Server API ───────────────────────────────────────────────────────────────

  async function verifyWishlistServer(productIds) {
    try {
      const res = await fetch(`${APP_PROXY_URL}/api/v1/wishlist/integration/verify`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ customerId: toGid('Customer', CUSTOMER_ID), productIds })
      });
      if (!res.ok) throw new Error('Verify failed');
      const data      = await res.json();
      const activeIds = new Set();
      productIds.forEach(id => {
        if (data[toGid('Product', id)] === true) activeIds.add(id);
      });
      return activeIds;
    } catch (e) {
      console.error('[Wishlist] verifyWishlistServer:', e);
      return new Set();
    }
  }

  async function toggleWishlistServer(productId, title, image, button) {
    button.classList.toggle('active');
    button.disabled = true;
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
      if (!res.ok || data.error) { button.classList.toggle('active'); throw new Error(data.error || 'Toggle failed'); }
      button.classList.toggle('active', data.status === 'added');
      showWishlistToast(title, image, data.status);
      dispatchWishlistEvent(productId, data.status);
    } catch (e) {
      console.error('[Wishlist] toggleWishlistServer:', e);
    } finally {
      button.disabled = false;
    }
  }

  function toggleWishlistLocal(productId, handle, title, image, button) {
    const wishlist = getLocalWishlist();
    const index    = wishlist.indexOf(productId);
    const status   = index > -1 ? 'removed' : 'added';

    if (status === 'removed') {
      wishlist.splice(index, 1);
      removeProductMeta(productId);
    } else {
      wishlist.push(productId);
      saveProductMeta(productId, handle, title, image);
    }

    button.classList.toggle('active', status === 'added');
    saveLocalWishlist(wishlist);
    showWishlistToast(title, image, status);
    dispatchWishlistEvent(productId, status);
  }

  // ─── Batch server verify (collection / search pages) ─────────────────────────
  // Collects all product IDs on the page and sends ONE verify request.

  let batchTimer        = null;
  let pendingIds        = new Set();
  let pendingComponents = new Map();

  function scheduleBatchVerify(productId, component) {
    pendingIds.add(productId);
    if (!pendingComponents.has(productId)) pendingComponents.set(productId, []);
    pendingComponents.get(productId).push(component);

    clearTimeout(batchTimer);
    batchTimer = setTimeout(async () => {
      const ids = [...pendingIds];
      pendingIds.clear();
      const activeIds = await verifyWishlistServer(ids);
      ids.forEach(id => {
        (pendingComponents.get(id) || []).forEach(c => {
          if (c.button) c.button.classList.toggle('active', activeIds.has(id));
        });
        pendingComponents.delete(id);
      });
    }, 50);
  }

  // ─── Shared init helper ───────────────────────────────────────────────────────
  // Extracts data attrs, runs backfill, sets initial active state, binds events.
  // Used by both product-page and non-product-page paths to avoid duplication.

  function initComponent(component, usesBatchVerify) {
    if (component._initialized) return;
    component._initialized = true;

    const { productId, productHandle: handle, productTitle: title, productImage: image } = component.dataset;
    const button = component.querySelector('[data-wishlist-btn]');

    if (!button || !productId) return;

    component.productId = productId;
    component.handle    = handle || '';
    component.title     = title  || '';
    component.image     = image  || '';
    component.button    = button;

    // Passive migration — fill missing meta for legacy wishlisted items
    backfillMetaIfNeeded(productId, component.handle, component.title, component.image);

    // Set initial active state
    if (IS_LOGGED_IN) {
      if (usesBatchVerify) {
        scheduleBatchVerify(productId, component);
      } else {
        verifyWishlistServer([productId]).then(activeIds => {
          button.classList.toggle('active', activeIds.has(productId));
        });
      }
    } else {
      button.classList.toggle('active', getLocalWishlist().includes(productId));
    }

    // Toggle on click
    button.addEventListener('click', (e) => {
      e.preventDefault();
      if (IS_LOGGED_IN) {
        toggleWishlistServer(productId, component.title, component.image, button);
      } else {
        toggleWishlistLocal(productId, component.handle, component.title, component.image, button);
      }
    });

    // Sync state from external events (e.g. removed on wishlist page)
    document.addEventListener('wishlist:updated', (e) => {
      if (e.detail.productId === productId) {
        button.classList.toggle('active', e.detail.status === 'added');
      }
    });
  }

  // ─── WishlistButton Web Component ────────────────────────────────────────────

  class WishlistButton extends HTMLElement {
    connectedCallback() {
      // Determine page type here (inside connectedCallback) so the check happens
      // at mount time, not at script parse time — avoids the prototype-override
      // race condition that could miss elements already in the DOM.
      const isProductPage = !!document.querySelector('.product-page, [data-product-page]');
      // Use batch verify on collection/search pages; single verify on product page.
      initComponent(this, !isProductPage);
    }
  }

  if (!customElements.get('wishlist-button')) {
    customElements.define('wishlist-button', WishlistButton);
  }

})();