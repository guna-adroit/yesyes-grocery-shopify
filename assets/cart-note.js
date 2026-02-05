import { Component } from '@theme/component';
import { debounce, fetchConfig } from '@theme/utilities';
import { cartPerformance } from '@theme/performance';

/**
 * A custom element that displays and controls the cart note.
 */
class CartNote extends Component {
  /** @type {AbortController | null} */
  #activeFetch = null;

  /**
   * Handles updates to the cart note (user OR programmatic).
   * @param {string} note
   * @param {Event | null} event
   */
  #commitNote = debounce(async (note, event = null) => {
    if (this.#activeFetch) {
      this.#activeFetch.abort();
    }

    const abortController = new AbortController();
    this.#activeFetch = abortController;

    try {
      const config = fetchConfig('json', {
        body: JSON.stringify({ note }),
      });

      await fetch(Theme.routes.cart_update_url, {
        ...config,
        signal: abortController.signal,
      });
    } catch (error) {
      // intentionally silent (theme standard)
    } finally {
      this.#activeFetch = null;
      if (event) {
        cartPerformance.measureFromEvent('note-update:user-action', event);
      }
    }
  }, 200);

  /**
   * User input handler (textarea typing)
   * @param {InputEvent} event
   */
  updateCartNote = (event) => {
    if (!(event.target instanceof HTMLTextAreaElement)) return;
    this.#commitNote(event.target.value, event);
  };

  /**
   * Programmatic API for external scripts (pickup, delivery, etc.)
   * @param {string} note
   */
  setNote(note) {
    const textarea = this.querySelector('textarea[name="note"]');
    if (!textarea) return;

    if (textarea.value === note) return;

    textarea.value = note;

    // Trigger theme-controlled update pipeline
    textarea.dispatchEvent(
      new Event('input', { bubbles: true })
    );
  }
}

if (!customElements.get('cart-note')) {
  customElements.define('cart-note', CartNote);
}

/**
 * Global helper (optional, but very useful)
 * Allows other scripts to safely update cart note
 */
window.updateCartNoteSafely = function (note) {
  const cartNoteEl = document.querySelector('cart-note');
  if (!cartNoteEl || typeof cartNoteEl.setNote !== 'function') return;
  cartNoteEl.setNote(note);
};
