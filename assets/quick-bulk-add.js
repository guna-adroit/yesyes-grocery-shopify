import { ThemeEvents, CartAddEvent, CartErrorEvent } from '@theme/events';

class QuantityInputBulk extends HTMLElement {
  static cart = null;
  static cartPromise = null;

  constructor() {
    super();
    this.variantId = Number(this.dataset.variantId);
    this.input = this.querySelector('input');
    this.plus = this.querySelector('[data-plus]');
    this.minus = this.querySelector('[data-minus]');
    this._isLoading = false;
  }

  connectedCallback() {
    if (!this.input) return;

    this.syncWithCart();

    this.plus.addEventListener('click', () => this.updateQuantity(1));
    this.minus.addEventListener('click', () => this.updateQuantity(-1));

    this.cartUpdateHandler = (e) => {
      const eventVariantId = e.detail?.variantId;
      if (!eventVariantId || eventVariantId === this.variantId) {
        this.syncWithCart();
      }
    };

    document.addEventListener(ThemeEvents.cartUpdate, this.cartUpdateHandler);
  }

  disconnectedCallback() {
    document.removeEventListener(ThemeEvents.cartUpdate, this.cartUpdateHandler);
  }

  setLoading(isLoading) {
    this._isLoading = isLoading;
    this.plus.disabled = isLoading;
    this.minus.disabled = isLoading || parseInt(this.input.value) === 0;
    this.classList.toggle('is-loading', isLoading);
  }

  /* ---------------------------------------------------------
     SHARED CART CACHE
     --------------------------------------------------------- */
  async syncWithCart() {
    if (this._isLoading) return;
    
    if (!QuantityInputBulk.cartPromise) {
      QuantityInputBulk.cartPromise = fetch('/cart.js')
        .then(res => res.json())
        .then(cart => {
          QuantityInputBulk.cart = cart;
          QuantityInputBulk.cartPromise = null;
          return cart;
        });
    }

    const cart = await QuantityInputBulk.cartPromise;
    const item = cart.items.find(i => i.variant_id === this.variantId);

    if (item) {
      this.input.value = item.quantity;
      this.minus.disabled = item.quantity === 0;
      this.classList.add('visible');
    } else {
      this.input.value = 0;
      this.minus.disabled = true;
      this.classList.remove('visible');
    }
  }

  instantUpdate(delta) {
    let qty = parseInt(this.input.value) || 0;
    qty = Math.max(0, qty + delta);

    this.input.value = qty;
    this.minus.disabled = qty === 0;

    if (qty > 0) this.classList.add('visible');
    else this.classList.remove('visible');
  }

  /* ---------------------------------------------------------
     UPDATE QUANTITY (PLUS / MINUS)
     --------------------------------------------------------- */
  async updateQuantity(delta) {
    if (this._isLoading) return;

    const currentQty = parseInt(this.input.value) || 0;
    const newQty = Math.max(0, currentQty + delta);

    this.setLoading(true);
    this.instantUpdate(delta);

    try {
      const res = await fetch('/cart/update.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: {
            [this.variantId]: newQty
          }
        })
      });

      if (!res.ok) {
        const error = await res.json();
        this.dispatchEvent(new CartErrorEvent(error));
        return;
      }

      const cartData = await res.json();
      QuantityInputBulk.cart = cartData;

      this.dispatchCartUpdate(cartData);

    } catch (err) {
      console.error(err);
    }

    this.setLoading(false);
  }

  /* ---------------------------------------------------------
     DISPATCH CART UPDATE
     --------------------------------------------------------- */
  dispatchCartUpdate(cartData) {
    const evt = new CartAddEvent(cartData, this.variantId.toString(), {
      source: 'quantity-input',
      itemCount: cartData.item_count,
      sections: cartData.sections
    });

    document.dispatchEvent(evt);
  }
}


customElements.define('quantity-input-bulk', QuantityInputBulk);

(function () {
  function updateProductCount(cart) {
    if (!cart || !Array.isArray(cart.items)) return;

    const productCountEl = document.querySelector('product-count[data-product-id]');
    if (!productCountEl) return;

    const productId = Number(productCountEl.dataset.productId);
    const countEl = productCountEl.querySelector('.product-total-count');

    let totalQty = 0;

    cart.items.forEach(item => {
      if (item.product_id === productId) {
        totalQty += item.quantity;
      }
    });

    countEl.textContent = totalQty;
  }

  /* ---------------------------------------------------------
     INITIAL LOAD
     --------------------------------------------------------- */
  if (QuantityInputBulk.cart?.items) {
    updateProductCount(QuantityInputBulk.cart);
  } else {
    fetch('/cart.js')
      .then(r => r.json())
      .then(cart => updateProductCount(cart));
  }

  /* ---------------------------------------------------------
     THEME CART EVENT (FIXED)
     --------------------------------------------------------- */
  document.addEventListener(ThemeEvents.cartUpdate, (e) => {
    console.log('CART UPDATE EVENT', e.detail.cart);
    const cart = e.detail?.cart || e.detail?.cartData;
    
    updateProductCount(cart);
  });

})();

