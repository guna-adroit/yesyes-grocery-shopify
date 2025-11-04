class ProductQuantityControl extends HTMLElement {
  constructor() {
    super();
    this.variantId = parseInt(this.dataset.variantId);
    this.quantity = 0;
    this.lineKey = null;
    this.isUpdating = false; // prevent double adds
  }

  connectedCallback() {
    this.render();
    this.querySelector('.qty-minus').addEventListener('click', this.decrease);
    this.querySelector('.qty-plus').addEventListener('click', this.increase);

    // Listen for global cart updates
    document.addEventListener(ThemeEvents.cartUpdate, this.#onCartUpdate);

    // Initialize count on first load
    this.#fetchCartAndSync();
  }

  disconnectedCallback() {
    document.removeEventListener(ThemeEvents.cartUpdate, this.#onCartUpdate);
  }

  render() {
    this.innerHTML = `
      <div class="quantity-control">
        <button class="qty-minus" aria-label="Decrease quantity">−</button>
        <span class="qty-value">${this.quantity}</span>
        <button class="qty-plus" aria-label="Increase quantity">+</button>
      </div>
    `;
  }

  #updateUI() {
    const valueEl = this.querySelector('.qty-value');
    if (valueEl) valueEl.textContent = this.quantity;
  }

  #show() {
    this.hidden = false;
  }

  #hide() {
    this.hidden = true;
  }

  #onCartUpdate = (e) => {
    const cart = e?.detail?.resource || e?.detail?.cart || e?.detail;
    if (!cart || !Array.isArray(cart.items)) return;

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

  async #fetchCartAndSync() {
    try {
      const res = await fetch('/cart.js');
      const cart = await res.json();
      const item = cart.items.find(i => i.variant_id === this.variantId);
      if (item) {
        this.quantity = item.quantity;
        this.lineKey = item.key;
        this.#updateUI();
        this.#show();
      }
    } catch (err) {
      console.error('Failed to sync cart quantity:', err);
    }
  }

  increase = async () => {
    if (this.isUpdating) return;
    this.isUpdating = true;
    this.quantity++;
    this.#updateUI();

    try {
      await this.#updateCartQuantity();
      this.isUpdating = false;
    } catch (err) {
      console.error(err);
      this.isUpdating = false;
    }
  };

  decrease = async () => {
    if (this.isUpdating) return;
    if (this.quantity <= 1) {
      this.quantity = 0;
      this.#updateUI();
      await this.#removeFromCart();
      return;
    }

    this.isUpdating = true;
    this.quantity--;
    this.#updateUI();

    try {
      await this.#updateCartQuantity();
      this.isUpdating = false;
    } catch (err) {
      console.error(err);
      this.isUpdating = false;
    }
  };

  async #updateCartQuantity() {
    const body = JSON.stringify({
      id: this.lineKey,
      quantity: this.quantity,
    });

    const res = await fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const cart = await res.json();
    document.dispatchEvent(new CustomEvent(ThemeEvents.cartUpdate, { detail: { resource: cart } }));
  }

  async #removeFromCart() {
    try {
      const res = await fetch('/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: this.lineKey, quantity: 0 }),
      });
      const cart = await res.json();
      document.dispatchEvent(new CustomEvent(ThemeEvents.cartUpdate, { detail: { resource: cart } }));
    } catch (err) {
      console.error('Failed to remove item:', err);
    }
  }
}

customElements.define('product-quantity-control', ProductQuantityControl);
