document.addEventListener('DOMContentLoaded', () => {
  const popup = document.getElementById('QuickAddPopup');
  const popupContent = document.getElementById('QuickAddPopupContent');

  // Open popup for multi-variant products
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

      // Reinitialize Horizon’s product form JS
      if (window.Shopify && Shopify.Horizon && Shopify.Horizon.ProductForm) {
        new Shopify.Horizon.ProductForm(popupContent.querySelector('form'));
      }
    } catch (err) {
      console.error(err);
      popupContent.innerHTML = '<p>Something went wrong loading this product.</p>';
    }
  });

  // Add single variant products directly to cart
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

  // Close popup
  popup.addEventListener('click', (e) => {
    if (e.target.classList.contains('popup-overlay') || e.target.classList.contains('popup-close')) {
      popup.classList.add('hidden');
      popupContent.innerHTML = '';
    }
  });
});
