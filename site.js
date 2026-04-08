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

    const closeNav = () => {
        nav.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('nav-open');
    };

    navToggle.setAttribute('aria-expanded', 'false');

    navToggle.addEventListener('click', () => {
        const isOpen = nav.classList.toggle('open');
        navToggle.setAttribute('aria-expanded', String(isOpen));
        document.body.classList.toggle('nav-open', isOpen);
    });

    nav.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', closeNav);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && nav.classList.contains('open')) {
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
    if (!lightbox || !lightboxImage) return;

    const closeLightbox = () => lightbox.classList.remove('active');

    document.querySelectorAll('.gallery-item').forEach((item) => {
        item.addEventListener('click', () => {
            if (item.classList.contains('is-placeholder')) return;

            const image = item.querySelector('img');
            if (!image || image.naturalWidth === 0) return;

            lightboxImage.src = image.currentSrc || image.src;
            lightboxImage.alt = image.alt;
            lightbox.classList.add('active');
        });
    });

    lightbox.addEventListener('click', (event) => {
        if (event.target !== lightboxImage) {
            closeLightbox();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeLightbox();
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
                item.style.display = showItem ? '' : 'none';
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
