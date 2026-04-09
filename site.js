function getFocusableElements(container) {
    return Array.from(container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'));
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
    }

    if (image.classList.contains('about-portrait')) {
        const fallback = document.querySelector('[data-portrait-fallback]');
        if (fallback) {
            fallback.hidden = false;
        }
    }
}

function initImageFallbacks() {
    document.querySelectorAll('.gallery-item img, .about-portrait').forEach((image) => {
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

    let activeTrigger = null;

    const closeLightbox = () => {
        if (!lightbox.classList.contains('active')) return;
        lightbox.classList.remove('active');
        lightbox.setAttribute('aria-hidden', 'true');
        lightboxImage.removeAttribute('src');
        lightboxImage.alt = '';
        if (activeTrigger) {
            activeTrigger.focus();
            activeTrigger = null;
        }
    };

    const openLightbox = (item) => {
        if (item.classList.contains('is-placeholder')) return;

        const image = item.querySelector('img');
        if (!image || image.naturalWidth === 0) return;

        activeTrigger = item;
        lightboxImage.src = image.currentSrc || image.src;
        lightboxImage.alt = image.alt;
        lightbox.classList.add('active');
        lightbox.setAttribute('aria-hidden', 'false');
        closeButton.focus();
    };

    document.querySelectorAll('.gallery-item').forEach((item) => {
        const image = item.querySelector('img');
        const label = image?.alt ? `Open ${image.alt} in lightbox` : 'Open image in lightbox';
        item.setAttribute('aria-label', label);

        item.addEventListener('click', () => openLightbox(item));
        item.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            openLightbox(item);
        });
    });

    closeButton.addEventListener('click', closeLightbox);

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

        if (event.key !== 'Tab') return;

        const focusable = getFocusableElements(lightbox);
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
    });
}

function initGalleryFilter() {
    const buttons = document.querySelectorAll('.filter-btn');
    if (buttons.length === 0) return;

    const items = document.querySelectorAll('.gallery-item');
    buttons.forEach((button) => {
        button.addEventListener('click', () => {
            buttons.forEach((current) => current.classList.remove('active'));
            button.classList.add('active');

            const filter = button.dataset.filter;
            items.forEach((item) => {
                const showItem = filter === 'all' || item.dataset.category === filter;
                item.hidden = !showItem;
                item.setAttribute('aria-hidden', String(!showItem));
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

document.addEventListener('DOMContentLoaded', () => {
    initHeader();
    initNavigation();
    initImageFallbacks();
    initLightbox();
    initGalleryFilter();
    initFadeObserver();
});
