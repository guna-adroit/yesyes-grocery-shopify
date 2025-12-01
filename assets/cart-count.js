import { ThemeEvents } from '@theme/events';

class CartCount extends HTMLElement {
  connectedCallback() {
    this.updateElementReference();
    console.log(this.updateElementReference();)
    // Listen to Horizon's ONLY cart event
    document.addEventListener(ThemeEvents.cartUpdate, () => {
      this.updateCartCount();

    });

    // Initial update
    this.updateCartCount();
  }

  // Whenever popup is re-rendered, the inner span changes
  updateElementReference() {
    this.countElement = this.querySelector('.popup-cart-count');
  }

  updateCartCount() {
    fetch('/cart.js')
      .then(res => res.json())
      .then(cart => {

        // Refresh reference in case popup is replaced
        this.updateElementReference();

        if (this.countElement) {
          this.countElement.textContent = `Items Total: ${cart.item_count}`;
        }
      })
      .catch(err => console.error('Cart fetch failed:', err));
  }
}

customElements.define('cart-count', CartCount);
