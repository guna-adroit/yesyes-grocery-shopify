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

document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.add-to-cart-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const variantId = form.dataset.variantId;
      const quantity = form.querySelector('input[name="quantity"]').value || 1;
      const message = form.nextElementSibling;

      try {
        const response = await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: variantId,
            quantity: quantity
          })
        });

        if (!response.ok) throw new Error('Network response was not ok');

        // Optionally open Dawn’s cart drawer if available
        const cartDrawer = document.querySelector('cart-drawer, #CartDrawer');
        if (cartDrawer && typeof cartDrawer.open === 'function') {
          cartDrawer.open();
        }

        // Show success message
        if (message) {
          message.style.display = 'block';
          message.textContent = 'Added to cart!';
          setTimeout(() => (message.style.display = 'none'), 2000);
        }

        // Optionally update cart count badge
        updateCartCount();

      } catch (error) {
        console.error('Add to cart failed:', error);
        if (message) {
          message.style.display = 'block';
          message.style.color = 'red';
          message.textContent = 'Error adding to cart';
          setTimeout(() => (message.style.display = 'none'), 2000);
        }
      }
    });
  });

  async function updateCartCount() {
    try {
      const res = await fetch('/cart.js');
      const cart = await res.json();
      const countEls = document.querySelectorAll('[data-cart-count], .cart-count-bubble');
      countEls.forEach(el => (el.textContent = cart.item_count));
    } catch (err) {
      console.error('Error updating cart count', err);
    }
  }
});
