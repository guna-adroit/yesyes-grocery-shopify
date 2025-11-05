function initQuickAddPopup() {
  const popup = document.getElementById('QuickAddPopup');
  const popupContent = document.getElementById('QuickAddPopupContent');

  if (!popup || !popupContent) return;


  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.quick-add-btn');
    if (!btn) return;

    const handle = btn.dataset.productHandle;
    popup.classList.remove('hidden');
    popupContent.innerHTML = '<div class="loading">Loading...</div>';

    try {
      const url = `/products/${handle}?section_id=quick-add-popup`;
      const response = await fetch(url);
      const html = await response.text();

      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;

      const form = tempDiv.querySelector('#QuickAddPopupContent');
      popupContent.innerHTML = form ? form.innerHTML : '<p>Could not load product form.</p>';

      // Reinit Horizon Product Form
      if (window.Shopify?.Horizon?.ProductForm) {
        new Shopify.Horizon.ProductForm(popupContent.querySelector('form'));
      }
    } catch (err) {
      console.error(err);
      popupContent.innerHTML = '<p>Something went wrong loading this product.</p>';
    }
  });

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.quick-add-direct');
    if (!btn) return;

    const variantId = btn.dataset.variantId;
    await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: variantId, quantity: 1 })
    });

    document.dispatchEvent(new CustomEvent('cart:updated'));
  });

  popup.addEventListener('click', (e) => {
  if (
    e.target.classList.contains('popup-overlay') ||
    e.target.closest('.popup-close')
  ) {
    popup.classList.add('hidden');
    popupContent.innerHTML = '';
  }
});
}

document.addEventListener('DOMContentLoaded', () => {
  const interval = setInterval(() => {
    if (document.getElementById('QuickAddPopup')) {
      clearInterval(interval);
      initQuickAddPopup();
    }
  }, 300);
});



import { CartAddEvent } from '@theme/events';

/**
 * Handles all `.add-to-cart-form` submissions with Horizon's event system.
 */
export function initCustomAddToCart() {
  document.querySelectorAll('.add-to-cart-form').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const button = form.querySelector('.add-to-cart-button');
      const variantId = form.dataset.variantId;
      const quantity = parseInt(form.querySelector('input[name="quantity"]')?.value || 1, 10);
      const message = form.nextElementSibling;

      if (!variantId) {
        console.error('⚠️ Missing variant ID on form:', form);
        return;
      }

      button.disabled = true;
      button.textContent = 'Adding...';

      try {
        // Step 1: Add to cart via Shopify Ajax API
        const addResponse = await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: variantId, quantity }),
        });

        if (!addResponse.ok) throw new Error('Add to cart failed');

        // Step 2: Fetch updated cart
        const cartResponse = await fetch('/cart.js');
        const cartData = await cartResponse.json();

        // Step 3: Dispatch Horizon’s native event (auto-opens cart drawer)
        document.dispatchEvent(
          new CartAddEvent(cartData, 'custom-add-to-cart', {
            variantId,
            itemCount: cartData.item_count,
            didError: false,
            source: 'custom-add-to-cart',
          }),
        );

        // Optional feedback
        if (message) {
          message.style.display = 'block';
          message.style.color = 'green';
          message.textContent = 'Added to cart!';
          setTimeout(() => (message.style.display = 'none'), 2000);
        }

      } catch (error) {
        console.error('Error adding to cart:', error);

        // Dispatch an error event (so Horizon can respond properly)
        document.dispatchEvent(
          new CartAddEvent(null, 'custom-add-to-cart', {
            variantId,
            didError: true,
            source: 'custom-add-to-cart',
          }),
        );

        if (message) {
          message.style.display = 'block';
          message.style.color = 'red';
          message.textContent = 'Error adding to cart';
          setTimeout(() => (message.style.display = 'none'), 2000);
        }

      } finally {
        button.disabled = false;
        button.textContent = 'Add to Cart';
      }
    });
  });
}

// Initialize when DOM ready
document.addEventListener('DOMContentLoaded', initCustomAddToCart);
