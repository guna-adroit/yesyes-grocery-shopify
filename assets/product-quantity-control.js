import { ThemeEvents, CartUpdateEvent } from '@theme/events';

class ProductQuantityControl extends HTMLElement {
  connectedCallback() {
    this.variantId = Number(this.dataset.variantId);
    this.productId = this.dataset.productId;
    this.addButton = this.closest('.product-card')?.querySelector('.add-to-cart-button');

    // Internal state
    this.quantity = 0;
    this.lineKey = null;
    this.isUpdating = false;

    this.#render();
    this.#cacheElements();
    this.#bindEvents();

    // Listen for global cart updates
    document.addEventListener(ThemeEvents.cartUpdate, this.#onCartUpdate);

    // Check cart immediately on init
    this.#syncWithCart();
  }

  disconnectedCallback() {
    document.removeEventListener(ThemeEvents.cartUpdate, this.#onCartUpdate);
  }

  #cacheElements() {
    this.buttonMinus = this.querySelector('.qty-minus');
    this.buttonPlus = this.querySelector('.qty-plus');
    this.valueEl = this.querySelector('.qty-value');
  }

  #bindEvents() {
    this.buttonMinus.addEventListener('click', () => this.#changeQuantity(this.quantity - 1));
    this.buttonPlus.addEventListener('click', () => this.#changeQuantity(this.quantity + 1));
  }

  #render() {
    this.innerHTML = `
      <div class="quantity-control">
        <button class="qty-minus button" aria-label="Decrease quantity">−</button>
        <span class="qty-value">1</span>
        <button class="qty-plus button" aria-label="Increase quantity">+</button>
      </div>
    `;
  }

  async #syncWithCart() {
    const res = await fetch('/cart.js');
    const cart = await res.json();
    const item = cart.items.find(i => i.variant_id === this.variantId);

    if (item) {
      this.quantity = item.quantity;
      this.lineKey = item.key;
      this.#show();
    } else {
      this.quantity = 0;
      this.lineKey = null;
      this.#hide();
    }
    this.#updateUI();
  }

  async #changeQuantity(newQty) {
    if (this.isUpdating) return;
    this.isUpdating = true;

    if (newQty <= 0) {
      await this.#updateCart(0);
      this.#hide();
      this.isUpdating = false;
      return;
    }

    await this.#updateCart(newQty);
    this.isUpdating = false;
  }

  async #updateCart(newQty) {
    const payload = this.lineKey
      ? { id: this.lineKey, quantity: newQty }
      : { id: this.variantId, quantity: newQty };

    const res = await fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const cart = await res.json();

    const item = cart.items.find(i => i.variant_id === this.variantId);
    if (item) {
      this.quantity = item.quantity;
      this.lineKey = item.key;
    } else {
      this.quantity = 0;
      this.lineKey = null;
    }
    this.#updateUI();

    document.dispatchEvent(new CartUpdateEvent(cart, this.productId, { variantId: this.variantId }));
  }

  #updateUI() {
    this.valueEl.textContent = this.quantity;
  }

  #show() {
    this.hidden = false;
    if (this.addButton) this.addButton.style.display = 'none';
  }

  #hide() {
    this.hidden = true;
    if (this.addButton) this.addButton.style.display = '';
  }

  #onCartUpdate = (e) => {
    const cart = e.detail?.resource;
    if (!cart) return;

    const item = cart.items.find(i => i.variant_id === this.variantId);
    if (item) {
      this.quantity = item.quantity;
      this.lineKey = item.key;
      this.#updateUI();
      this.#show();
    } else {
      this.quantity = 0;
      this.lineKey = null;
      this.#updateUI();
      this.#hide();
    }
  };
}

customElements.define('product-quantity-control', ProductQuantityControl);
