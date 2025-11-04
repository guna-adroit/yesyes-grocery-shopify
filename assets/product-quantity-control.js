import { ThemeEvents, CartUpdateEvent } from '@theme/events';

class QuantityControl extends HTMLElement {
  connectedCallback() {
    this.productId = this.dataset.productId;
    this.variantId = this.dataset.variantId;
    this.quantity = parseInt(this.dataset.quantity || '1', 10);

    this.render();

    this.querySelector('.qty-plus').addEventListener('click', () => this.updateQuantity(this.quantity + 1));
    this.querySelector('.qty-minus').addEventListener('click', () => this.updateQuantity(this.quantity - 1));

    document.addEventListener(ThemeEvents.cartUpdate, (e) => this.handleCartUpdate(e));
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

  updateQuantity(newQty) {
    if (newQty < 1) {
      // Remove product from cart
      this.removeFromCart();
      return;
    }

    fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: this.variantId,
        quantity: newQty,
      }),
    })
      .then((res) => res.json())
      .then((cart) => {
        this.quantity = newQty;
        this.querySelector('.qty-value').textContent = newQty;

        // Dispatch global cart update event
        document.dispatchEvent(new CartUpdateEvent(cart, this.productId, { variantId: this.variantId }));
      })
      .catch(console.error);
  }

  removeFromCart() {
    fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: this.variantId,
        quantity: 0,
      }),
    })
      .then((res) => res.json())
      .then((cart) => {
        document.dispatchEvent(new CartUpdateEvent(cart, this.productId, { variantId: this.variantId }));
        // Replace back with Add to Cart button dynamically
        this.closest('.product-form')?.querySelector('.add-to-cart-button')?.classList.remove('hidden');
        this.remove();
      });
  }

  handleCartUpdate(e) {
    const cart = e.detail.resource;
    const lineItem = cart.items.find((item) => item.variant_id == this.variantId);
    if (lineItem) {
      this.quantity = lineItem.quantity;
      this.querySelector('.qty-value').textContent = this.quantity;
    } else {
      // Product removed from cart — restore Add to Cart button
      this.closest('.product-form')?.querySelector('.add-to-cart-button')?.classList.remove('hidden');
      this.remove();
    }
  }
}

customElements.define('quantity-control', QuantityControl);
