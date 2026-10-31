function getFocusableElements(container) {
    return Array.from(container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter((element) => !element.hidden && element.getClientRects().length > 0);
}

function makeGalleryItemStatic(item) {
    item.removeAttribute('role');
    item.removeAttribute('tabindex');
    item.removeAttribute('aria-haspopup');
    item.removeAttribute('aria-label');
}

function initHeader() {
    const header = document.getElementById('header');
    if (!header) return;

    const updateHeader = () => {
        header.classList.toggle('scrolled', window.scrollY > 50);
    };

    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
}

function initNavigation() {
    const navToggle = document.getElementById('nav-toggle');
    const nav = document.getElementById('nav');
    if (!navToggle || !nav) return;

    if (!nav.id) {
        nav.id = 'nav';
    }

    let restoreTarget = null;

    const handleNavKeydown = (event) => {
        if (!nav.classList.contains('open')) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            closeNav();
            return;
        }

        if (event.key !== 'Tab') return;

        const focusable = getFocusableElements(nav);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    const closeNav = () => {
        nav.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('nav-open');
        document.removeEventListener('keydown', handleNavKeydown);
        if (restoreTarget) {
            restoreTarget.focus();
        }
    };

    const openNav = () => {
        restoreTarget = document.activeElement instanceof HTMLElement ? document.activeElement : navToggle;
        nav.classList.add('open');
        navToggle.setAttribute('aria-expanded', 'true');
        document.body.classList.add('nav-open');
        document.addEventListener('keydown', handleNavKeydown);
        const [firstLink] = getFocusableElements(nav);
        if (firstLink) {
            firstLink.focus();
        }
    };

    navToggle.setAttribute('aria-controls', nav.id);
    navToggle.setAttribute('aria-expanded', 'false');

    navToggle.addEventListener('click', () => {
        if (nav.classList.contains('open')) {
            closeNav();
            return;
        }
        openNav();
    });

    nav.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', closeNav);
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && nav.classList.contains('open')) {
            closeNav();
        }
    });
}

function markImageMissing(image) {
    image.classList.add('is-missing');

    const galleryItem = image.closest('.gallery-item');
    if (galleryItem) {
        galleryItem.classList.add('is-placeholder');
        makeGalleryItemStatic(galleryItem);
    }

    if (image.closest('[data-portrait]')) {
        const fallback = image.closest('[data-portrait]')?.querySelector('.fallback, [data-portrait-fallback]');
        if (fallback) {
            fallback.hidden = false;
        }
    }
}

function initImageFallbacks() {
    document.querySelectorAll('.gallery-item img, .about-portrait, [data-portrait] img').forEach((image) => {
        const onMissing = () => markImageMissing(image);

        image.addEventListener('error', onMissing, { once: true });

        if (image.complete && image.getAttribute('src') && image.naturalWidth === 0) {
            onMissing();
        }
    });
}

function initLightbox() {
    const lightbox = document.getElementById('lightbox');
    const lightboxImage = document.getElementById('lightbox-img');
    const closeButton = lightbox?.querySelector('.lightbox-close');
    if (!lightbox || !lightboxImage || !closeButton) return;

    const prevButton = lightbox.querySelector('.lightbox-prev');
    const nextButton = lightbox.querySelector('.lightbox-next');
    const caption = document.getElementById('lightbox-caption');
    const backgroundRegions = Array.from(document.body.children)
        .filter((element) => element !== lightbox && element.tagName !== 'SCRIPT');

    let activeTrigger = null;
    let currentItem = null;

    const isOpenable = (item) => !item.hidden && !item.classList.contains('is-placeholder');
    const openableItems = () => Array.from(document.querySelectorAll('.gallery-item')).filter(isOpenable);

    const showItem = (item) => {
        const image = item.querySelector('img');
        if (!image) return;

        currentItem = item;
        lightboxImage.src = image.currentSrc || image.src;
        lightboxImage.alt = image.alt;

        const items = openableItems();
        const position = items.indexOf(item) + 1;
        const title = item.querySelector('.gallery-item-title')?.textContent.trim() || image.alt;
        if (caption) {
            caption.textContent = [title, position > 0 ? `Image ${position} of ${items.length}` : '']
                .filter(Boolean)
                .join(' - ');
        }

        const canMove = items.length > 1;
        [prevButton, nextButton].forEach((button) => {
            if (button) button.hidden = !canMove;
        });
    };

    const move = (step) => {
        const items = openableItems();
        if (items.length < 2 || !currentItem) return;
        const index = items.indexOf(currentItem);
        const nextIndex = (index + step + items.length) % items.length;
        showItem(items[nextIndex]);
    };

    const setBackgroundInert = (inert) => {
        backgroundRegions.forEach((element) => {
            if (inert) {
                element.setAttribute('inert', '');
            } else {
                element.removeAttribute('inert');
            }
        });
    };

    const closeLightbox = () => {
        if (!lightbox.classList.contains('active')) return;
        lightbox.classList.remove('active');
        lightbox.setAttribute('aria-hidden', 'true');
        setBackgroundInert(false);
        lightboxImage.removeAttribute('src');
        lightboxImage.alt = '';
        if (caption) caption.textContent = '';

        // Return focus to the photo last shown, so keyboard users land where they left off.
        const returnTarget = currentItem && isOpenable(currentItem) ? currentItem : activeTrigger;
        currentItem = null;
        activeTrigger = null;
        if (returnTarget) {
            returnTarget.focus();
        }
    };

    const openLightbox = (item) => {
        if (!isOpenable(item)) return;

        const image = item.querySelector('img');
        if (!image || image.naturalWidth === 0) return;

        activeTrigger = item;
        showItem(item);
        lightbox.classList.add('active');
        lightbox.setAttribute('aria-hidden', 'false');
        setBackgroundInert(true);
        closeButton.focus();
    };

    document.querySelectorAll('.gallery-item').forEach((item) => {
        if (item.classList.contains('is-placeholder')) {
            makeGalleryItemStatic(item);
            return;
        }

        const image = item.querySelector('img');
        const label = image?.alt ? `Open ${image.alt} in lightbox` : 'Open image in lightbox';
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.setAttribute('aria-haspopup', 'dialog');
        item.setAttribute('aria-label', label);

        item.addEventListener('click', () => openLightbox(item));
        item.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            openLightbox(item);
        });
    });

    closeButton.addEventListener('click', closeLightbox);
    prevButton?.addEventListener('click', () => move(-1));
    nextButton?.addEventListener('click', () => move(1));

    lightbox.addEventListener('click', (event) => {
        if (event.target === lightbox || event.target === lightboxImage.parentElement) {
            closeLightbox();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (!lightbox.classList.contains('active')) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            closeLightbox();
            return;
        }

        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            move(event.key === 'ArrowLeft' ? -1 : 1);
            return;
        }

        if (event.key !== 'Tab') return;

        const focusable = getFocusableElements(lightbox);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (!lightbox.contains(document.activeElement)) {
            event.preventDefault();
            first.focus();
        } else if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
}

function initGalleryFilter() {
    const buttons = document.querySelectorAll('.filter-btn');
    if (buttons.length === 0) return;

    const items = document.querySelectorAll('.gallery-item');
    buttons.forEach((button) => {
        button.setAttribute('aria-pressed', String(button.classList.contains('active')));

        button.addEventListener('click', () => {
            buttons.forEach((current) => {
                current.classList.remove('active');
                current.setAttribute('aria-pressed', 'false');
            });
            button.classList.add('active');
            button.setAttribute('aria-pressed', 'true');

            const filter = button.dataset.filter;
            items.forEach((item) => {
                item.hidden = !(filter === 'all' || item.dataset.category === filter);
            });
        });
    });
}

function initFadeObserver() {
    if (!('IntersectionObserver' in window)) return;

    const targets = document.querySelectorAll('.gallery-item');
    if (targets.length === 0) return;

    const observer = new IntersectionObserver((entries, activeObserver) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('fade-up');
            activeObserver.unobserve(entry.target);
        });
    }, { threshold: 0.12 });

    targets.forEach((target) => observer.observe(target));
}

function initContactForm() {
    const form = document.getElementById('contact-form');
    const status = document.getElementById('contact-form-status');
    if (!form || !status) return;

    form.addEventListener('submit', (event) => {
        event.preventDefault();

        const name = form.querySelector('#contact-name')?.value.trim() || '';
        const replyTo = form.querySelector('#contact-reply')?.value.trim() || '';
        const subject = form.querySelector('#contact-subject')?.value.trim() || '';
        const message = form.querySelector('#contact-message')?.value.trim() || '';
        const honeypot = form.querySelector('#contact-company')?.value.trim() || '';

        if (honeypot) {
            status.textContent = 'Submission blocked.';
            status.dataset.state = 'error';
            return;
        }

        if (!name || !replyTo || !subject || !message) {
            status.textContent = 'Please complete every field before opening the email draft.';
            status.dataset.state = 'error';
            return;
        }

        const mailSubject = encodeURIComponent(`[Photography archive] ${subject}`);
        const mailBody = encodeURIComponent([
            `Name: ${name}`,
            `Reply-to: ${replyTo}`,
            '',
            message,
            '',
            'Note: this archive no longer accepts new photography commissions.'
        ].join('\n'));

        status.textContent = 'Opening your email app with a prepared draft.';
        status.dataset.state = 'success';
        window.location.href = `mailto:kol@koltregaskes.com?subject=${mailSubject}&body=${mailBody}`;
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initHeader();
    initNavigation();
    initImageFallbacks();
    initLightbox();
    initGalleryFilter();
    initFadeObserver();
    initContactForm();
});
