import { ThemeEvents } from '@theme/events';

class CartCount extends HTMLElement {
  constructor() {
    super();
    this.countElement = this.querySelector('.popup-cart-count');
  }

  connectedCallback() {
    if (!this.countElement) return;

    // Listen to Horizon's universal cart update event
    document.addEventListener(ThemeEvents.cartUpdate, () => {
      this.updateCartCount();
    });

    // Initial load
    this.updateCartCount();
  }

  updateCartCount() {
    fetch('/cart.js')
      .then(res => res.json())
      .then(cart => {
        this.countElement.textContent = `Items Total: ${cart.item_count}`;
      })
      .catch(err => console.error('Cart fetch failed:', err));
  }
}

customElements.define('cart-count', CartCount);
