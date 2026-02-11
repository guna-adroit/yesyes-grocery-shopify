(async function () {

  /*
    HARD-CODED FOR NOW
  */
  const cartId = "gid://shopify/Cart/hWN8dp3X7a5opThl60BH0Hno?key=9bd2b398f96eb6571b39c1864792d1ce";


  function extractCartToken(cartId) {
    const match = cartId.match(/Cart\/(.+)$/);
    return match ? match[1] : null;
  }


  function setCartCookie(token) {
    document.cookie =
      "cart=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
    
    document.cookie =
      "cart=" + token +
      "; path=/; SameSite=Lax";
  }


  async function getCart() {
    const res = await fetch('/cart.json', { credentials: 'include' });
    return await res.json();
  }


  async function addItemsToCart(items) {
    if (!items.length) return;

    await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map(item => ({
          id: item.variant_id,
          quantity: item.quantity
        }))
      })
    });
  }


  async function mergeCarts(localCart, remoteCart) {

    if (!localCart.items.length) return;

    const remoteMap = {};

    remoteCart.items.forEach(item => {
      remoteMap[item.variant_id] = item.quantity;
    });

    const itemsToAdd = [];

    localCart.items.forEach(item => {

      const remoteQty = remoteMap[item.variant_id] || 0;

      if (remoteQty) {
        // If exists, add only difference
        itemsToAdd.push({
          variant_id: item.variant_id,
          quantity: item.quantity
        });
      } else {
        itemsToAdd.push({
          variant_id: item.variant_id,
          quantity: item.quantity
        });
      }

    });

    await addItemsToCart(itemsToAdd);
  }


  async function syncAndMerge(cartId) {

    const token = extractCartToken(cartId);
    if (!token) return;

    // Step 1 — Capture current cart
    const localCart = await getCart();

    // Step 2 — Switch to remote cart
    setCartCookie(token);

    // Step 3 — Hydrate remote
    let remoteCart = await getCart();

    if (!remoteCart || !remoteCart.token) {
      console.error("Remote cart invalid");
      return;
    }

    // Step 4 — Merge local into remote
    await mergeCarts(localCart, remoteCart);

    // Step 5 — Final cart state
    const finalCart = await getCart();

    console.log("Final merged cart:", finalCart);

    window.location.reload();
  }


  /*
    Prevent infinite loop
  */
  if (!sessionStorage.getItem('cart_synced')) {
    sessionStorage.setItem('cart_synced', 'true');
    await syncAndMerge(cartId);
  }

})();
