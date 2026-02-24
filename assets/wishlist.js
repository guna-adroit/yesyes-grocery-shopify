(function () {
  const WISHLIST_STORAGE_KEY = 'shopify_wishlist';
  const IS_LOGGED_IN = window.WishlistConfig?.isLoggedIn ?? false;
  const CUSTOMER_ID  = window.WishlistConfig?.customerId ?? null;
  const APP_PROXY_URL = window.WishlistConfig?.appProxyUrl ?? '';

  // ─── Shared Utilities ──

  function getLocalWishlist() {
    try {
      return JSON.parse(localStorage.getItem(WISHLIST_STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function saveLocalWishlist(wishlist) {
    try {
      localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(wishlist));
    } catch (e) {
      console.error('Error saving wishlist:', e);
    }
  }

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
          <p>${title} has been ${type} ${type === 'added' ? 'to' : 'from'} your Wishlist.</p>
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

  // ─── Server API ──────────────────────────────────────────────────────────────

  async function verifyWishlistServer(productIds) {
    // productIds: array of numeric strings e.g. ['12345678']
    // Returns a Set of product IDs that are in the wishlist
    try {
      const response = await fetch(`${APP_PROXY_URL}/api/v1/wishlist/integration/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: toGid('Customer', CUSTOMER_ID),
          productIds: productIds
        })
      });

      if (!response.ok) throw new Error('Verify request failed');

      const data = await response.json();
      // data shape: { "gid://shopify/Product/123": true, ... }

      const activeIds = new Set();
      productIds.forEach(id => {
        if (data[toGid('Product', id)] === true) {
          activeIds.add(id);
        }
      });

      return activeIds;
    } catch (e) {
      console.error('Error verifying wishlist:', e);
      return new Set();
    }
  }

  async function toggleWishlistServer(productId, title, image, button) {
    const productGid = toGid('Product', productId);
    const customerGid = toGid('Customer', CUSTOMER_ID);

    // Optimistic UI
    button.classList.toggle('active');
    button.disabled = true;

    try {
      const response = await fetch(`${APP_PROXY_URL}/api/v1/wishlist/integration/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: customerGid, productId: productGid })
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        // Revert optimistic update
        button.classList.toggle('active');
        throw new Error(data.error || 'Toggle failed');
      }

      // Confirm UI matches server response
      button.classList.toggle('active', data.status === 'added');
      showWishlistToast(title, image, data.status);
      dispatchWishlistEvent(productId, data.status);

    } catch (e) {
      console.error('Error toggling wishlist:', e);
    } finally {
      button.disabled = false;
    }
  }

  function toggleWishlistLocal(productId, title, image, button) {
    const wishlist = getLocalWishlist();
    const index = wishlist.indexOf(productId);
    const status = index > -1 ? 'removed' : 'added';

    if (status === 'removed') {
      wishlist.splice(index, 1);
    } else {
      wishlist.push(productId);
    }

    button.classList.toggle('active', status === 'added');
    saveLocalWishlist(wishlist);
    showWishlistToast(title, image, status);
    dispatchWishlistEvent(productId, status);
  }

  // ─── Web Component ───────────────────────────────────────────────────────────

  class WishlistButton extends HTMLElement {
    constructor() {
      super();
      this._initialized = false;
    }

    connectedCallback() {
      if (this._initialized) return;
      this._initialized = true;

      this.productId = this.dataset.productId;
      this.title = this.dataset.productTitle;
      this.image = this.dataset.productImage;
      this.button = this.querySelector('[data-wishlist-btn]');

      if (!this.button || !this.productId) return;

      // Check initial state
      this._setInitialState();

      // Bind click
      this.button.addEventListener('click', (e) => {
        e.preventDefault();
        this._handleToggle();
      });

      // Listen for external wishlist updates (e.g. removed from wishlist page)
      document.addEventListener('wishlist:updated', (e) => {
        if (e.detail.productId === this.productId) {
          this.button.classList.toggle('active', e.detail.status === 'added');
        }
      });
    }

    async _setInitialState() {
      if (IS_LOGGED_IN) {
        // Server verify — this is the FIX: properly await and apply result
        const activeIds = await verifyWishlistServer([this.productId]);
        this.button.classList.toggle('active', activeIds.has(this.productId));
      } else {
        // Local storage check
        const wishlist = getLocalWishlist();
        this.button.classList.toggle('active', wishlist.includes(this.productId));
      }
    }

    async _handleToggle() {
      if (IS_LOGGED_IN) {
        await toggleWishlistServer(this.productId, this.title, this.image, this.button);
      } else {
        toggleWishlistLocal(this.productId, this.title, this.image, this.button);
      }
    }
  }

  customElements.define('wishlist-button', WishlistButton);

  // ─── Batch Verify for Product Cards ─────────────────────────────────────────
  // If multiple <wishlist-button> elements are on the same page (collection/search),
  // this batches the verify call into ONE request instead of N requests.

  let batchTimer = null;
  let pendingIds = new Set();
  let pendingComponents = new Map(); // productId -> WishlistButton[]

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
        const components = pendingComponents.get(id) || [];
        components.forEach(c => {
          if (c.button) {
            c.button.classList.toggle('active', activeIds.has(id));
          }
        });
        pendingComponents.delete(id);
      });
    }, 50); // Wait 50ms to collect all components on the page
  }

  // Patch _setInitialState to use batching when on non-product pages
  const isProductPage = !!document.querySelector('.product-page, [data-product-page]');

  if (!isProductPage) {
    // Override for collection/search pages to batch the verify call
    const originalConnectedCallback = WishlistButton.prototype.connectedCallback;
    WishlistButton.prototype.connectedCallback = function () {
      if (this._initialized) return;
      this._initialized = true;

      this.productId = this.dataset.productId;
      this.title = this.dataset.productTitle;
      this.image = this.dataset.productImage;
      this.button = this.querySelector('[data-wishlist-btn]');

      if (!this.button || !this.productId) return;

      // Use batch verify instead of individual verify
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