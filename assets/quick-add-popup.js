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
    let addToCart =  document.querySelectorAll('.add-to-cart-btn');
    console.log("addToCart");
  addToCart.forEach(button => {
    button.addEventListener('click', async (e) => {
      const variantId = e.currentTarget.getAttribute('data-variant-id');

      const formData = {
        items: [
          {
            id: variantId,
            quantity: 1
          }
        ]
      };

      try {
        const response = await fetch('/cart/add.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(formData)
        });

        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();

        console.log('Added to cart:', data);

        // Optional: update AJAX cart or show a success message
        document.dispatchEvent(new CustomEvent('cart:updated', { detail: data }));
      } catch (error) {
        console.error('Error adding to cart:', error);
      }
    });
  });
});