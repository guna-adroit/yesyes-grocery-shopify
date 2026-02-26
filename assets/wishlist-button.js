(function () {
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
    catch (e) { console.error('[Wishlist] Error saving wishlist:', e); }
  }

  function getLocalMeta() {
    try   { return JSON.parse(localStorage.getItem(WISHLIST_META_KEY) || '{}'); }
    catch { return {}; }
  }

  function saveLocalMeta(meta) {
    try   { localStorage.setItem(WISHLIST_META_KEY, JSON.stringify(meta)); }
    catch (e) { console.error('[Wishlist] Error saving wishlist meta:', e); }
  }

  function saveProductMeta(productId, handle, title, image) {
    if (!productId || !handle) return;
    const meta = getLocalMeta();
    meta[productId] = { handle, title, image };
    saveLocalMeta(meta);
  }

  function removeProductMeta(productId) {
    const meta = getLocalMeta();
    if (meta[productId]) {
      delete meta[productId];
      saveLocalMeta(meta);
    }
  }

  /**
   * Passive legacy migration.
   *
   * Called on every wishlist-button mount. If:
   *   • The product IS in shopify_wishlist (added before this update), AND
   *   • It has NO entry in shopify_wishlist_meta (handle was never saved), AND
   *   • This element has a data-product-handle attribute
   * → save the meta entry immediately.
   *
   * As the guest user browses collection pages, product pages, search results,
   * each mounted wishlist-button fills in its own missing entry. After visiting
   * enough pages all 21 IDs will have handles and the wishlist page will be full.
   */
  function backfillMetaIfNeeded(productId, handle, title, image) {
    if (IS_LOGGED_IN) return;    // meta is guest-only
    if (!productId || !handle) return;

    const wishlist = getLocalWishlist();
    if (!wishlist.includes(productId)) return;   // not in wishlist — nothing to do

    const meta = getLocalMeta();
    if (meta[productId]?.handle) return;         // already cached — nothing to do

    // Product is wishlisted but handle was never saved — fix it now
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
    const existing = document.querySelector('.wishlist-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `wishlist-toast ${type}`;
    toast.innerHTML = `
      <div class="wishlist-toast-inner">
        <img src="${image}" alt="${title}" />
        <div class="wishlist-toast-content">
          <strong>${title}</strong>
          <p>has been ${type} ${type === 'added' ? 'to' : 'from'} your Wishlist.</p>
        </div>
      </div>
    `;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  // ─── Server API ───────────────────────────────────────────────────────────────

  async function verifyWishlistServer(productIds) {
    try {
      const response = await fetch(`${APP_PROXY_URL}/api/v1/wishlist/integration/verify`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          customerId: toGid('Customer', CUSTOMER_ID),
          productIds
        })
      });

      if (!response.ok) throw new Error('Verify request failed');

      const data      = await response.json();
      const activeIds = new Set();
      productIds.forEach(id => {
        if (data[toGid('Product', id)] === true) activeIds.add(id);
      });
      return activeIds;
    } catch (e) {
      console.error('[Wishlist] Error verifying wishlist:', e);
      return new Set();
    }
  }

  async function toggleWishlistServer(productId, title, image, button) {
    const productGid  = toGid('Product', productId);
    const customerGid = toGid('Customer', CUSTOMER_ID);

    button.classList.toggle('active'); // optimistic
    button.disabled = true;

    try {
      const response = await fetch(`${APP_PROXY_URL}/api/v1/wishlist/integration/toggle`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ customerId: customerGid, productId: productGid })
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        button.classList.toggle('active'); // revert
        throw new Error(data.error || 'Toggle failed');
      }

      button.classList.toggle('active', data.status === 'added');
      showWishlistToast(title, image, data.status);
      dispatchWishlistEvent(productId, data.status);
    } catch (e) {
      console.error('[Wishlist] Error toggling wishlist:', e);
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
      saveProductMeta(productId, handle, title, image);  // always save handle on add
    }

    button.classList.toggle('active', status === 'added');
    saveLocalWishlist(wishlist);
    showWishlistToast(title, image, status);
    dispatchWishlistEvent(productId, status);
  }

  // ─── WishlistButton Web Component ────────────────────────────────────────────

  class WishlistButton extends HTMLElement {
    constructor() {
      super();
      this._initialized = false;
    }

    connectedCallback() {
      if (this._initialized) return;
      this._initialized = true;

      this.productId = this.dataset.productId;
      this.handle    = this.dataset.productHandle || '';
      this.title     = this.dataset.productTitle  || '';
      this.image     = this.dataset.productImage  || '';
      this.button    = this.querySelector('[data-wishlist-btn]');

      if (!this.button || !this.productId) return;

      // ── Passive migration: fill any missing meta entry immediately ──────────
      backfillMetaIfNeeded(this.productId, this.handle, this.title, this.image);

      this._setInitialState();

      this.button.addEventListener('click', (e) => {
        e.preventDefault();
        this._handleToggle();
      });

      document.addEventListener('wishlist:updated', (e) => {
        if (e.detail.productId === this.productId) {
          this.button.classList.toggle('active', e.detail.status === 'added');
        }
      });
    }

    async _setInitialState() {
      if (IS_LOGGED_IN) {
        const activeIds = await verifyWishlistServer([this.productId]);
        this.button.classList.toggle('active', activeIds.has(this.productId));
      } else {
        const wishlist = getLocalWishlist();
        this.button.classList.toggle('active', wishlist.includes(this.productId));
      }
    }

    async _handleToggle() {
      if (IS_LOGGED_IN) {
        await toggleWishlistServer(this.productId, this.title, this.image, this.button);
      } else {
        toggleWishlistLocal(this.productId, this.handle, this.title, this.image, this.button);
      }
    }
  }

  customElements.define('wishlist-button', WishlistButton);

  // ─── Batch Verify for collection / search pages ───────────────────────────────

  let batchTimer        = null;
  let pendingIds        = new Set();
  let pendingComponents = new Map();

  function scheduleBatchVerify(productId, component) {
    pendingIds.add(productId);

    if (!pendingComponents.has(productId)) {
      pendingComponents.set(productId, []);
    }
    pendingComponents.get(productId).push(component);

    clearTimeout(batchTimer);
    batchTimer = setTimeout(async () => {
      if (!IS_LOGGED_IN) return;

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

  const isProductPage = !!document.querySelector('.product-page, [data-product-page]');

  if (!isProductPage) {
    WishlistButton.prototype.connectedCallback = function () {
      if (this._initialized) return;
      this._initialized = true;

      this.productId = this.dataset.productId;
      this.handle    = this.dataset.productHandle || '';
      this.title     = this.dataset.productTitle  || '';
      this.image     = this.dataset.productImage  || '';
      this.button    = this.querySelector('[data-wishlist-btn]');

      if (!this.button || !this.productId) return;

      // ── Passive migration on every page, every button ──────────────────────
      backfillMetaIfNeeded(this.productId, this.handle, this.title, this.image);

      if (IS_LOGGED_IN) {
        scheduleBatchVerify(this.productId, this);
      } else {
        const wishlist = getLocalWishlist();
        this.button.classList.toggle('active', wishlist.includes(this.productId));
      }

      this.button.addEventListener('click', (e) => {
        e.preventDefault();
        this._handleToggle();
      });

      document.addEventListener('wishlist:updated', (e) => {
        if (e.detail.productId === this.productId) {
          this.button.classList.toggle('active', e.detail.status === 'added');
        }
      });
    };
  }

})();
