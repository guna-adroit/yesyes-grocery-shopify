import { CartAddEvent } from '@theme/events';

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





document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('form[action$="/cart/add"]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const button = form.querySelector('.add-to-cart-button');
      const message = form.nextElementSibling;
      const formData = new FormData(form);

      button.disabled = true;
      button.textContent = 'Adding...';
      message.style.display = 'none';

      try {
        const response = await fetch(`${window.Shopify.routes.root}cart/add.js`, {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.description || 'Error adding to cart');

        // Dispatch Horizon’s cart event
        document.dispatchEvent(
          new CartAddEvent(data, form.dataset.variantId, {
            variantId: formData.get('id'),
            productId: data.product_id,
            itemCount: data.quantity,
            source: 'ajax-form',
          })
        );

        message.textContent = 'Added to cart!';
        message.className = 'cart-message cart-message--success';
        message.style.display = 'block';
      } catch (error) {
        console.error(error);
        message.textContent = 'Error adding to cart.';
        message.className = 'cart-message cart-message--error';
        message.style.display = 'block';
      } finally {
        button.disabled = false;
        button.textContent = 'Add to Cart';
        setTimeout(() => (message.style.display = 'none'), 2000);
      }
    });
  });
});

