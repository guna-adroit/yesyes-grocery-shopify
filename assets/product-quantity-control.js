import { ThemeEvents, CartAddEvent } from '@theme/events';

class ProductQuantityControl extends HTMLElement {
  connectedCallback() {
    this.variantId = Number(this.dataset.variantId);
    this.productId = Number(this.dataset.productId);
    this.innerHTML = '';
    this.isVisible = false;

    // Listen for "added to cart" event
    document.addEventListener(ThemeEvents.cartAdd, this.#onCartAdd);
    document.addEventListener(ThemeEvents.cartUpdated, this.#onCartUpdate);

    // Load current cart state (e.g., on page load or after re-render)
    this.#refreshQuantity();
  }

  disconnectedCallback() {
    document.removeEventListener(ThemeEvents.cartAdd, this.#onCartAdd);
    document.removeEventListener(ThemeEvents.cartUpdated, this.#onCartUpdate);
  }

  #onCartAdd = (event) => {
    const { productId } = event.detail.options || {};
    if (Number(productId) === this.productId) {
      this.#refreshQuantity();
    }
  };

  #onCartUpdate = () => {
    this.#refreshQuantity();
  };

  async #refreshQuantity() {
    const res = await fetch('/cart.js');
    const cart = await res.json();
    const item = cart.items.find(i => i.variant_id === this.variantId);

    if (item) {
      this.quantity = item.quantity;
      this.#render();
      this.#show();
    } else {
      this.#hide();
    }
  }

  #show() {
    if (!this.isVisible) {
      const addToCart = this.closest('.product-card')?.querySelector('add-to-cart-component');
      if (addToCart) addToCart.style.display = 'none';
      this.hidden = false;
      this.isVisible = true;
    }
  }

  #hide() {
    const addToCart = this.closest('.product-card')?.querySelector('add-to-cart-component');
    if (addToCart) addToCart.style.display = 'block';
    this.hidden = true;
    this.isVisible = false;
  }

  async #updateQuantity(newQty) {
    if (newQty < 0) return;
    await fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: this.variantId, quantity: newQty }),
    });

    // Re-sync the state
    this.#refreshQuantity();

    // Let Horizon’s header/cart icon update automatically
    document.dispatchEvent(new CustomEvent(ThemeEvents.cartUpdated));
  }

  #render() {
    this.innerHTML = `
      <div class="quantity-control">
        <button class="qty-minus" aria-label="Decrease quantity">−</button>
        <span class="qty-value">${this.quantity}</span>
        <button class="qty-plus" aria-label="Increase quantity">+</button>
      </div>
    `;

    this.querySelector('.qty-minus').addEventListener('click', () => this.#updateQuantity(this.quantity - 1));
    this.querySelector('.qty-plus').addEventListener('click', () => this.#updateQuantity(this.quantity + 1));
  }
}

if (!customElements.get('product-quantity-control')) {
  customElements.define('product-quantity-control', ProductQuantityControl);
}
