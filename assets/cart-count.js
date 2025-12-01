import { ThemeEvents, CartAddEvent, CartErrorEvent } from '@theme/events';

class CartCount extends HTMLElement {
  constructor() {
    super();

    // Cache the counter element
    this.countElement = this.querySelector('.popup-cart-count');
  }

  connectedCallback() {
    // Listener for any cart updates dispatched from theme
    document.addEventListener(ThemeEvents.cartUpdate, () => {
      this.updateCartCount();
    });

    // For compatibility, also listen to add-to-cart events
    document.addEventListener(ThemeEvents.cartAdd, () => {
      this.updateCartCount();
    });

    // Call once on load
    this.updateCartCount();
  }

  /**
   * Fetch the latest cart data and update the text
   */
  updateCartCount() {
    fetch('/cart.js')
      .then((res) => res.json())
      .then((cart) => {
        if (this.countElement) {
          this.countElement.textContent = `Items Total: ${cart.item_count}`;
        }
      })
      .catch((err) => {
        console.error('Cart fetch failed:', err);
      });
  }
}

customElements.define('cart-count', CartCount);
