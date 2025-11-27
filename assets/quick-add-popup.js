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

  // document.addEventListener('click', async (e) => {
  //   const btn = e.target.closest('.quick-add-direct');
  //   if (!btn) return;

  //   const variantId = btn.dataset.variantId;
  //   await fetch('/cart/add.js', {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({ id: variantId, quantity: 1 })
  //   });

  //   document.dispatchEvent(new CustomEvent('cart:updated'));
  // });

  popup.addEventListener('click', (e) => {
  if (
    e.target.classList.contains('popup-overlay') ||
    e.target.closest('.popup-close') || e.target.closest('.confirm-button')
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


// QUick Add
document.addEventListener('click', async (event) => {
  const button = event.target.closest('.add-to-cart-btn');
  if (!button) return; // Only handle clicks on Add to Cart buttons

  const variantId = button.getAttribute('data-variant-id');
  if (!variantId) return console.error('No variant ID found');

  button.disabled = true;
  button.textContent = 'Adding...';

  try {
    const response = await fetch('/cart/add.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        items: [{ id: variantId, quantity: 1 }]
      })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    console.log('✅ Added to cart:', data);

    // Trigger cart drawer update if you're using Dawn theme
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: data }));

    button.textContent = 'Added!';
  } catch (error) {
    console.error('❌ Add to Cart error:', error);
    button.textContent = 'Error';
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = 'Add to Cart';
    }, 2000);
  }
});
