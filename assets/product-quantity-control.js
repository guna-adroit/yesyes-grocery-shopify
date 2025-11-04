import { ThemeEvents } from '@theme/events';

class ProductQuantityControl extends HTMLElement {
  connectedCallback() {
    this.variantId = Number(this.dataset.variantId);
    this.productId = Number(this.dataset.productId);
    this.quantity = 0;
    this.isVisible = false;

    this.#render();
    this.#cacheElements();
    this.#attachEvents();

    document.addEventListener(ThemeEvents.cartUpdated, this.#onCartUpdate);

    // Initial sync
    this.#refreshQuantity();
  }

  disconnectedCallback() {
    document.removeEventListener(ThemeEvents.cartUpdated, this.#onCartUpdate);
  }

  #cacheElements() {
    this.buttonMinus = this.querySelector('.qty-minus');
    this.buttonPlus = this.querySelector('.qty-plus');
    this.valueEl = this.querySelector('.qty-value');
  }

  #attachEvents() {
    this.buttonMinus.addEventListener('click', () => this.#updateQuantity(this.quantity - 1));
    this.buttonPlus.addEventListener('click', () => this.#updateQuantity(this.quantity + 1));
  }

  #onCartUpdate = () => {
    this.#refreshQuantity();
  };

  async #refreshQuantity() {
    try {
      const res = await fetch('/cart.js');
      const cart = await res.json();

      const item = cart.items.find(i => i.variant_id === this.variantId);
      if (item) {
        this.quantity = item.quantity;
        this.lineItemKey = item.key; // needed for cart/change.js
        this.#updateUI();
        this.#show();
      } else {
        this.quantity = 0;
        this.lineItemKey = null;
        this.#updateUI();
        this.#hide();
      }
    } catch (err) {
      console.error('Cart refresh failed', err);
    }
  }

  async #updateQuantity(newQty) {
    if (newQty < 0) return;

    // use variant ID when adding, or line item key when updating existing one
    const body = this.lineItemKey
      ? { id: this.lineItemKey, quantity: newQty }
      : { id: this.variantId, quantity: newQty };

    await fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    // immediately trigger Horizon cart updates
    document.dispatchEvent(new CustomEvent(ThemeEvents.cartUpdated));
    await this.#refreshQuantity();
  }

  #updateUI() {
    this.valueEl.textContent = this.quantity;
  }

  #show() {
    if (this.isVisible) return;
    const addToCart = this.closest('.product-card')?.querySelector('add-to-cart-component');
    if (addToCart) addToCart.style.display = 'none';
    this.hidden = false;
    this.isVisible = true;
  }

  #hide() {
    if (!this.isVisible) return;
    const addToCart = this.closest('.product-card')?.querySelector('add-to-cart-component');
    if (addToCart) addToCart.style.display = '';
    this.hidden = true;
    this.isVisible = false;
  }

  #render() {
    this.innerHTML = `
      <div class="quantity-control">
        <button class="qty-minus button" aria-label="Decrease quantity">−</button>
        <span class="qty-value">${this.quantity}</span>
        <button class="qty-plus button" aria-label="Increase quantity">+</button>
      </div>
    `;
  }
}

if (!customElements.get('product-quantity-control')) {
  customElements.define('product-quantity-control', ProductQuantityControl);
}
