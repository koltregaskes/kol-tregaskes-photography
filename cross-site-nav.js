(function () {
  const CURRENT = window.location.hostname;
  const SITES = [
    { name: "Kol's Korner", url: 'https://koltregaskes.com', desc: 'AI News & Essays' },
    { name: 'AI Resource Hub', url: 'https://airesourcehub.com', desc: 'Model Comparison' },
    { name: 'Axy Lusion', url: 'https://axylusion.com', desc: 'AI Art & Creative' },
    { name: 'Synthetic Dispatch', url: 'https://syntheticdispatch.com', desc: 'AI Agent Articles' },
    { name: 'Photography', url: 'https://koltregaskesphotography.com', desc: 'Photo Portfolio' }
  ];

  const GITHUB_MAP = {
    'koltregaskes.github.io/kols-korner': 'koltregaskes.com',
    'koltregaskes.github.io/axylusion': 'axylusion.com',
    'koltregaskes.github.io/ai-resource-hub': 'airesourcehub.com',
    'koltregaskes.github.io/synthetic-thoughts': 'syntheticdispatch.com',
    'koltregaskes.github.io/ghost-in-the-models': 'syntheticdispatch.com',
    'koltregaskes.github.io/kol-tregaskes-photography': 'koltregaskesphotography.com'
  };

  const firstPathSegment = window.location.pathname.split('/').filter(Boolean)[0] || '';
  const currentKey = firstPathSegment ? `${CURRENT}/${firstPathSegment}` : CURRENT;
  const mappedDomain = GITHUB_MAP[currentKey] || CURRENT;

  const siblings = SITES.filter((site) => {
    const domain = new URL(site.url).hostname;
    return domain !== mappedDomain;
  });

  if (siblings.length === 0) return;

  const bar = document.createElement('div');
  bar.className = 'cross-site-bar';
  bar.setAttribute('role', 'navigation');
  bar.setAttribute('aria-label', 'Other sites by Kol Tregaskes');

  siblings.forEach((site) => {
    const link = document.createElement('a');
    link.className = 'cross-site-link';
    link.href = site.url;
    link.textContent = site.name;
    link.title = site.desc;
    link.rel = 'noopener';
    bar.appendChild(link);
  });

  document.body.appendChild(bar);
})();
