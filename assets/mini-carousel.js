/**
 * <mini-carousel>: a multi-slide carousel that pages by the number of visible slides.
 * Scrolling and swiping are native (CSS scroll snap); this element adds arrows,
 * page dots, autoplay and theme editor support.
 *
 * Attributes:
 *   autoplay="5"      seconds between pages (omit to disable)
 *   loop              arrows wrap around at the ends
 *   pause-on-hover    pause autoplay while the pointer is over the carousel
 *   data-dot-label    accessible label for dots, with [index] and [length] placeholders
 */
if (!customElements.get('mini-carousel')) {
  class MiniCarousel extends HTMLElement {
    #positions = [0];
    #page = 0;
    #timer = null;
    #pauseReasons = new Set();
    #scrollFrame = null;
    #abort = null;
    #resizeObserver = null;
    #intersectionObserver = null;
    #reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    connectedCallback() {
      this.track = this.querySelector('[data-track]');
      if (!this.track) return;

      this.slides = Array.from(this.track.children);
      this.dotsContainer = this.querySelector('[data-dots]');
      this.prevButtons = this.querySelectorAll('[data-prev]');
      this.nextButtons = this.querySelectorAll('[data-next]');

      this.#abort = new AbortController();
      const { signal } = this.#abort;

      this.prevButtons.forEach((button) => button.addEventListener('click', () => this.previous(true), { signal }));
      this.nextButtons.forEach((button) => button.addEventListener('click', () => this.next(true), { signal }));
      this.track.addEventListener('scroll', () => this.#onScroll(), { passive: true, signal });

      if (this.hasAttribute('pause-on-hover')) {
        this.addEventListener('pointerenter', () => this.#pause('hover'), { signal });
        this.addEventListener('pointerleave', () => this.#resume('hover'), { signal });
      }
      this.addEventListener('focusin', () => this.#pause('focus'), { signal });
      this.addEventListener('focusout', (event) => {
        if (!this.contains(/** @type {Node} */ (event.relatedTarget))) this.#resume('focus');
      }, { signal });
      document.addEventListener('visibilitychange', () => {
        document.hidden ? this.#pause('hidden') : this.#resume('hidden');
      }, { signal });

      // Theme editor: show the selected slide and hold autoplay while it is being edited.
      document.addEventListener('shopify:block:select', (event) => this.#onBlockSelect(event), { signal });
      document.addEventListener('shopify:block:deselect', () => this.#resume('editor'), { signal });

      this.#resizeObserver = new ResizeObserver(() => this.#update());
      this.#resizeObserver.observe(this.track);

      this.#intersectionObserver = new IntersectionObserver(([entry]) => {
        entry?.isIntersecting ? this.#resume('offscreen') : this.#pause('offscreen');
      });
      this.#intersectionObserver.observe(this);

      this.#update();
      this.#startAutoplay();
    }

    disconnectedCallback() {
      this.#abort?.abort();
      this.#resizeObserver?.disconnect();
      this.#intersectionObserver?.disconnect();
      this.#stopAutoplay();
      if (this.#scrollFrame) cancelAnimationFrame(this.#scrollFrame);
    }

    get loop() {
      return this.hasAttribute('loop');
    }

    get pageCount() {
      return this.#positions.length;
    }

    get autoplayInterval() {
      return (parseFloat(this.getAttribute('autoplay') ?? '') || 0) * 1000;
    }

    /** -1 in right-to-left layouts, where scrollLeft runs negative. */
    get #direction() {
      return getComputedStyle(this.track).direction === 'rtl' ? -1 : 1;
    }

    next(userInitiated = false) {
      const target = this.#page + 1;
      const wrap = this.loop || !userInitiated;
      this.goTo(target >= this.pageCount && wrap ? 0 : target, userInitiated);
    }

    previous(userInitiated = false) {
      const target = this.#page - 1;
      this.goTo(target < 0 && this.loop ? this.pageCount - 1 : target, userInitiated);
    }

    goTo(page, userInitiated = false) {
      const index = Math.min(Math.max(page, 0), this.pageCount - 1);
      const behavior = this.#reducedMotion.matches ? 'auto' : 'smooth';

      this.track.scrollTo({ left: this.#positions[index] * this.#direction, behavior });
      this.#setPage(index);

      // Give the shopper a full interval after they navigate.
      if (userInitiated) this.#restartAutoplay();
    }

    /** Recalculates page positions from the current layout. */
    #update() {
      const firstSlide = this.slides[0];
      if (!firstSlide) return;

      const gap = parseFloat(getComputedStyle(this.track).columnGap) || 0;
      const step = firstSlide.getBoundingClientRect().width + gap;
      const perView = Math.max(1, Math.floor((this.track.clientWidth + gap + 1) / step));
      const maxScroll = Math.max(0, this.track.scrollWidth - this.track.clientWidth);

      const positions = [];
      for (let index = 0; index < this.slides.length; index += perView) {
        const position = Math.min(Math.round(index * step), maxScroll);
        if (positions.length && position - positions[positions.length - 1] < 2) break;
        positions.push(position);
        if (position >= maxScroll) break;
      }
      this.#positions = positions.length ? positions : [0];

      this.toggleAttribute('data-single', this.pageCount <= 1);
      this.#renderDots();
      this.#syncPageFromScroll();

      if (this.pageCount <= 1) this.#stopAutoplay();
      else this.#startAutoplay();
    }

    #renderDots() {
      if (!this.dotsContainer || this.dotsContainer.childElementCount === this.pageCount) return;

      const label = this.dataset.dotLabel || 'Slide [index] of [length]';
      const fragment = document.createDocumentFragment();

      for (let index = 0; index < this.pageCount; index++) {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'mini-carousel__dot';
        dot.setAttribute('aria-label', label.replace('[index]', `${index + 1}`).replace('[length]', `${this.pageCount}`));
        dot.addEventListener('click', () => this.goTo(index, true));
        fragment.append(dot);
      }

      this.dotsContainer.replaceChildren(fragment);
    }

    #onScroll() {
      if (this.#scrollFrame) cancelAnimationFrame(this.#scrollFrame);
      this.#scrollFrame = requestAnimationFrame(() => this.#syncPageFromScroll());
    }

    #syncPageFromScroll() {
      const scroll = Math.abs(this.track.scrollLeft);
      const lastPosition = this.#positions[this.pageCount - 1];

      let closest = 0;
      if (scroll >= lastPosition - 2) {
        closest = this.pageCount - 1;
      } else {
        this.#positions.forEach((position, index) => {
          if (Math.abs(position - scroll) < Math.abs(this.#positions[closest] - scroll)) closest = index;
        });
      }

      this.#setPage(closest);
    }

    #setPage(page) {
      this.#page = page;

      this.dotsContainer?.querySelectorAll('.mini-carousel__dot').forEach((dot, index) => {
        dot.setAttribute('aria-current', `${index === page}`);
      });

      const atStart = !this.loop && page === 0;
      const atEnd = !this.loop && page >= this.pageCount - 1;
      this.prevButtons.forEach((button) => (button.disabled = atStart));
      this.nextButtons.forEach((button) => (button.disabled = atEnd));
    }

    #onBlockSelect(event) {
      const slideIndex = this.slides.findIndex((slide) => slide === event.target || slide.contains(event.target));
      if (slideIndex === -1) return;

      this.#pause('editor');
      const slideLeft = this.slides[slideIndex].offsetLeft - this.slides[0].offsetLeft;
      const page = this.#positions.findLastIndex((position) => position <= Math.abs(slideLeft) + 2);
      this.goTo(Math.max(page, 0));
    }

    #startAutoplay() {
      if (this.#timer || !this.autoplayInterval || this.#reducedMotion.matches) return;
      if (this.pageCount <= 1 || this.#pauseReasons.size) return;

      this.#timer = setInterval(() => this.next(), this.autoplayInterval);
    }

    #stopAutoplay() {
      clearInterval(this.#timer);
      this.#timer = null;
    }

    #restartAutoplay() {
      this.#stopAutoplay();
      this.#startAutoplay();
    }

    #pause(reason) {
      this.#pauseReasons.add(reason);
      this.#stopAutoplay();
    }

    #resume(reason) {
      this.#pauseReasons.delete(reason);
      this.#startAutoplay();
    }
  }

  customElements.define('mini-carousel', MiniCarousel);
}
