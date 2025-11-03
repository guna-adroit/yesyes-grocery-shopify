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

  const closeBtn = popup.querySelector('.popup-close');
  const overlay = popup.querySelector('.popup-overlay');

  // Close button click
  closeBtn.addEventListener('click', () => {
    popup.classList.add('hidden');
    popupContent.innerHTML = '';
  });

  // Overlay click
  overlay.addEventListener('click', () => {
    popup.classList.add('hidden');
    popupContent.innerHTML = '';
  });

document.addEventListener('DOMContentLoaded', () => {
  const interval = setInterval(() => {
    if (document.getElementById('QuickAddPopup')) {
      clearInterval(interval);
      initQuickAddPopup();
    }
  }, 300);
});
