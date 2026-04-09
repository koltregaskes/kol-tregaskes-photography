const TOPIC_LABELS = {
    camera: 'Cameras',
    camera_release: 'Releases',
    lens: 'Lenses',
    photo_editing: 'Editing',
    photoshop: 'Photoshop',
    lightroom: 'Lightroom',
    capture_one: 'Capture One',
    photography_ai: 'AI Photo',
    photography_technique: 'Technique',
    photography_business: 'Business',
    opinion: 'Opinion',
    hardware: 'Hardware'
};

const PHOTO_TOPIC_TAGS = new Set([
    'camera',
    'camera_release',
    'lens',
    'photo_editing',
    'photoshop',
    'lightroom',
    'capture_one',
    'photography_ai',
    'photography_technique',
    'photography_business'
]);

const SUPPRESSED_SOURCE_PATTERNS = [
    /^Reddit /i,
    /^CoinDesk$/i,
    /^CoinTelegraph$/i,
    /^The Block$/i,
    /^BeInCrypto$/i,
    /^Aligned News/i
];

const QUICK_RANGES = [
    { key: 'all', label: 'All available', days: null },
    { key: 'today', label: 'Today', days: 0 },
    { key: '7d', label: 'Last 7 days', days: 7 },
    { key: '30d', label: 'Last 30 days', days: 30 }
];

class PhotographyNewsApp {
    constructor() {
        this.articles = [];
        this.filteredArticles = [];
        this.activeTopics = new Set();
        this.searchTerm = '';
        this.quickRange = 'all';
        this.dateFrom = '';
        this.dateTo = '';
        this.viewMode = document.body.dataset.newsView || 'news';
        this.init();
    }

    async init() {
        this.cacheElements();
        this.readUrlState();
        this.bindEvents();
        await this.loadArticles();
        this.renderFilters();
        this.updateViewMetadata();
        this.applyFilters();
    }

    cacheElements() {
        this.loading = document.getElementById('news-loading');
        this.empty = document.getElementById('news-empty');
        this.groups = document.getElementById('news-groups');
        this.summary = document.getElementById('news-summary');
        this.summaryText = document.getElementById('news-summary-text');
        this.summaryNote = document.getElementById('news-summary-note');
        this.searchInput = document.getElementById('news-search');
        this.topicFilters = document.getElementById('news-topic-filters');
        this.rangeFilters = document.getElementById('news-range-filters');
        this.dateFromInput = document.getElementById('news-date-from');
        this.dateToInput = document.getElementById('news-date-to');
        this.storyCount = document.getElementById('news-story-count');
        this.digestCount = document.getElementById('news-digest-count');
        this.latestDate = document.getElementById('news-latest-date');
        this.clearButton = document.getElementById('news-clear');
        this.viewKicker = document.getElementById('news-view-kicker');
        this.viewTitle = document.getElementById('news-view-title');
        this.viewIntro = document.getElementById('news-view-intro');
        this.viewPanelTitle = document.getElementById('news-view-panel-title');
        this.viewPanelCopy = document.getElementById('news-view-panel-copy');
        this.viewPanelSecondary = document.getElementById('news-view-panel-secondary');
    }

    readUrlState() {
        const params = new URLSearchParams(window.location.search);
        this.searchTerm = params.get('q')?.trim().toLowerCase() || '';
        this.quickRange = QUICK_RANGES.some((range) => range.key === params.get('window'))
            ? params.get('window')
            : 'all';
        this.dateFrom = params.get('from') || '';
        this.dateTo = params.get('to') || '';

        const topics = params.getAll('topic').map((topic) => topic.trim()).filter(Boolean);
        topics.forEach((topic) => {
            if (Object.prototype.hasOwnProperty.call(TOPIC_LABELS, topic)) {
                this.activeTopics.add(topic);
            }
        });
    }

    bindEvents() {
        this.searchInput?.addEventListener('input', (event) => {
            this.searchTerm = event.target.value.trim().toLowerCase();
            this.applyFilters();
        });

        this.dateFromInput?.addEventListener('change', (event) => {
            this.dateFrom = event.target.value;
            if (this.dateFrom) {
                this.quickRange = 'all';
            }
            this.renderRangeFilters();
            this.applyFilters();
        });

        this.dateToInput?.addEventListener('change', (event) => {
            this.dateTo = event.target.value;
            if (this.dateTo) {
                this.quickRange = 'all';
            }
            this.renderRangeFilters();
            this.applyFilters();
        });

        this.clearButton?.addEventListener('click', () => {
            this.searchTerm = '';
            this.quickRange = 'all';
            this.dateFrom = '';
            this.dateTo = '';
            this.activeTopics.clear();

            if (this.searchInput) this.searchInput.value = '';
            if (this.dateFromInput) this.dateFromInput.value = '';
            if (this.dateToInput) this.dateToInput.value = '';

            this.renderFilters();
            this.updateViewMetadata();
            this.applyFilters();
        });
    }

    async loadArticles() {
        const filenames = await this.loadDigestList();
        const requests = filenames.map(async (filename) => {
            try {
                const response = await fetch(`news-digests/${filename}`, { cache: 'no-store' });
                if (!response.ok) return [];
                const markdown = await response.text();
                return this.parseDigest(markdown, filename);
            } catch {
                return [];
            }
        });

        const results = await Promise.all(requests);
        this.articles = results
            .flat()
            .filter((article) => this.shouldDisplayArticle(article))
            .sort((left, right) => {
                if (right.date.getTime() !== left.date.getTime()) {
                    return right.date.getTime() - left.date.getTime();
                }
                return (right.score || 0) - (left.score || 0);
            });

        this.filteredArticles = [...this.articles];
        this.updateStats();

        if (this.searchInput) {
            this.searchInput.value = this.searchTerm;
        }
        if (this.dateFromInput) {
            this.dateFromInput.value = this.dateFrom;
        }
        if (this.dateToInput) {
            this.dateToInput.value = this.dateTo;
        }

        if (this.loading) {
            this.loading.hidden = true;
        }
    }

    async loadDigestList() {
        const files = new Set();
        let hasManifestEntries = false;

        try {
            const response = await fetch('news-digests/index.json', { cache: 'no-store' });
            if (response.ok) {
                const payload = await response.json();
                if (Array.isArray(payload.files)) {
                    payload.files.forEach((file) => files.add(file));
                    hasManifestEntries = payload.files.length > 0;
                }
            }
        } catch {
            // Optional manifest. Fallback covers local development edge cases.
        }

        if (!hasManifestEntries) {
            this.generateFallbackDigestList(30).forEach((file) => files.add(file));
        }

        return Array.from(files).sort().reverse();
    }

    generateFallbackDigestList(daysBack) {
        const files = [];
        const today = new Date();

        for (let offset = 0; offset < daysBack; offset += 1) {
            const current = new Date(today);
            current.setDate(today.getDate() - offset);
            const year = current.getFullYear();
            const month = String(current.getMonth() + 1).padStart(2, '0');
            const day = String(current.getDate()).padStart(2, '0');
            files.push(`digest-${year}-${month}-${day}.md`);
        }

        return files;
    }

    parseDigest(markdown, filename) {
        const digestDate = this.extractDigestDate(markdown, filename);
        const sections = markdown
            .replace(/\r/g, '')
            .split(/\n---+\n/)
            .map((section) => section.trim())
            .filter(Boolean);

        return sections
            .map((section) => this.parseArticleSection(section, digestDate))
            .filter(Boolean);
    }

    parseArticleSection(section, digestDate) {
        if (!section.startsWith('## ')) return null;

        const linkMatch = section.match(/^##\s+\[([\s\S]+?)\]\((https?:\/\/[^\s)]+)\)/m);
        if (!linkMatch) return null;

        const rawTitle = this.decodeEntities(linkMatch[1]);
        const title = this.cleanTitle(rawTitle);
        const url = linkMatch[2];
        const sourceMatch = section.match(/\*([^*]+)\*\s+\|\s+(?:(\d{2}\/\d{2}\/\d{4})\s+\|\s+)?Score:\s+([0-9.]+)/m);
        const source = sourceMatch ? this.normalizeText(this.decodeEntities(sourceMatch[1])) : this.extractSource(url);
        const score = sourceMatch ? Number.parseFloat(sourceMatch[3]) : null;
        const tagsMatch = section.match(/^Tags:\s*(.+)$/m);
        const tags = tagsMatch
            ? tagsMatch[1].split(',').map((tag) => tag.trim()).filter(Boolean)
            : [];

        const embeddedSummary = this.buildSummary(rawTitle, title);
        const summary = this.buildSummary(
            section
                .replace(linkMatch[0], '')
                .replace(sourceMatch ? sourceMatch[0] : '', '')
                .replace(tagsMatch ? tagsMatch[0] : '', ''),
            title
        ) || embeddedSummary;

        return {
            title,
            url,
            source,
            score,
            date: digestDate,
            dateKey: digestDate.toISOString().slice(0, 10),
            dateLabel: this.formatDateLabel(digestDate),
            compactDateLabel: this.formatCardDate(digestDate),
            summary,
            tags
        };
    }

    extractDigestDate(markdown, filename) {
        const headerMatch = markdown.match(/\*\*(\d{4}-\d{2}-\d{2})\*\*/);
        const fileMatch = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
        const dateText = headerMatch ? headerMatch[1] : fileMatch ? fileMatch[0] : null;
        const parsed = dateText ? new Date(`${dateText}T12:00:00`) : new Date();
        return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    }

    cleanTitle(rawTitle) {
        const lines = rawTitle
            .split('\n')
            .map((line) => this.normalizeText(this.decodeEntities(line)))
            .filter(Boolean)
            .filter((line) => !this.isMetadataLine(line));

        return lines[0] || this.normalizeText(this.decodeEntities(rawTitle));
    }

    buildSummary(rawBody, title) {
        const normalizedLines = rawBody
            .split('\n')
            .map((line) => this.normalizeText(this.decodeEntities(line)))
            .filter(Boolean);

        const cleanLine = (line) => line.replace(/^>\s*/, '').trim();

        const summaryLines = normalizedLines
            .map(cleanLine)
            .filter((line) => !this.isMetadataLine(line))
            .filter((line) => !title || line.toLowerCase() !== title.toLowerCase())
            .filter((line) => !line.startsWith('http'))
            .filter((line) => !line.startsWith('['));

        if (summaryLines.length === 0) return '';

        const summary = summaryLines.join(' ');
        return summary.length > 260 ? `${summary.slice(0, 257).trim()}...` : summary;
    }

    isMetadataLine(line) {
        return !line
            || /^by$/i.test(line)
            || /^published\b/i.test(line)
            || /^score:\s+/i.test(line)
            || /^tags:\s+/i.test(line)
            || /^(news|opinion|review|firmware|deal|updated|gopro|sony|canon|nikon|fujifilm)$/i.test(line)
            || /^[A-Z]{1,4}$/.test(line)
            || /^[A-Z0-9\s/&-]{3,}$/.test(line)
            || /^[A-Z][a-z]+(?:\s+[A-Z][a-z.'-]+){1,3}$/.test(line);
    }

    shouldDisplayArticle(article) {
        if (SUPPRESSED_SOURCE_PATTERNS.some((pattern) => pattern.test(article.source))) {
            return false;
        }

        const text = `${article.title} ${article.summary} ${article.tags.join(' ')}`.toLowerCase();
        if (/machinelearning|localllama|ethereum|bitcoin|crypto/.test(text)) {
            return false;
        }

        return article.tags.some((tag) => PHOTO_TOPIC_TAGS.has(tag));
    }

    renderFilters() {
        this.renderTopicFilters();
        this.renderRangeFilters();
    }

    renderTopicFilters() {
        if (!this.topicFilters) return;

        const availableTopics = Array.from(new Set(
            this.articles
                .flatMap((article) => article.tags)
                .filter((tag) => Object.prototype.hasOwnProperty.call(TOPIC_LABELS, tag))
        ));

        const orderedTopics = Object.keys(TOPIC_LABELS).filter((tag) => availableTopics.includes(tag));
        this.topicFilters.innerHTML = '';
        this.topicFilters.appendChild(this.createTopicButton('all', 'All topics', this.activeTopics.size === 0));

        orderedTopics.forEach((tag) => {
            this.topicFilters.appendChild(this.createTopicButton(tag, TOPIC_LABELS[tag], this.activeTopics.has(tag)));
        });
    }

    createTopicButton(tag, label, isActive) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `news-chip${isActive ? ' active' : ''}`;
        button.textContent = label;
        button.addEventListener('click', () => {
            if (tag === 'all') {
                this.activeTopics.clear();
            } else if (this.activeTopics.has(tag)) {
                this.activeTopics.delete(tag);
            } else {
                this.activeTopics.clear();
                this.activeTopics.add(tag);
            }

            this.renderTopicFilters();
            this.updateViewMetadata();
            this.applyFilters();
        });
        return button;
    }

    renderRangeFilters() {
        if (!this.rangeFilters) return;

        this.rangeFilters.innerHTML = '';
        QUICK_RANGES.forEach((range) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `news-chip${this.quickRange === range.key && !this.hasCustomDateRange() ? ' active' : ''}`;
            button.textContent = range.label;
            button.addEventListener('click', () => {
                this.quickRange = range.key;
                this.dateFrom = '';
                this.dateTo = '';
                if (this.dateFromInput) this.dateFromInput.value = '';
                if (this.dateToInput) this.dateToInput.value = '';
                this.renderRangeFilters();
                this.applyFilters();
            });
            this.rangeFilters.appendChild(button);
        });
    }

    hasCustomDateRange() {
        return Boolean(this.dateFrom || this.dateTo);
    }

    applyFilters() {
        this.filteredArticles = this.articles.filter((article) => {
            const haystack = [
                article.title,
                article.source,
                article.summary,
                article.tags.join(' ')
            ].join(' ').toLowerCase();

            const matchesSearch = !this.searchTerm || haystack.includes(this.searchTerm);
            const matchesTopic = this.activeTopics.size === 0
                || article.tags.some((tag) => this.activeTopics.has(tag));
            const matchesDate = this.matchesDateFilter(article.date);

            return matchesSearch && matchesTopic && matchesDate;
        });

        this.writeUrlState();
        this.updateSummary();
        this.renderArticles();
    }

    matchesDateFilter(date) {
        const target = new Date(`${date.toISOString().slice(0, 10)}T12:00:00`);

        if (this.dateFrom) {
            const from = new Date(`${this.dateFrom}T00:00:00`);
            if (target < from) return false;
        }

        if (this.dateTo) {
            const to = new Date(`${this.dateTo}T23:59:59`);
            if (target > to) return false;
        }

        if (this.hasCustomDateRange()) {
            return true;
        }

        const selectedRange = QUICK_RANGES.find((range) => range.key === this.quickRange);
        if (!selectedRange || selectedRange.days === null) {
            return true;
        }

        const latest = this.articles[0]?.date;
        if (!latest) return true;

        const end = new Date(`${latest.toISOString().slice(0, 10)}T23:59:59`);
        const start = new Date(end);
        start.setDate(end.getDate() - selectedRange.days);
        start.setHours(0, 0, 0, 0);

        return target >= start && target <= end;
    }

    writeUrlState() {
        const params = new URLSearchParams();

        if (this.searchTerm) {
            params.set('q', this.searchTerm);
        }

        Array.from(this.activeTopics).sort().forEach((topic) => {
            params.append('topic', topic);
        });

        if (this.dateFrom) params.set('from', this.dateFrom);
        if (this.dateTo) params.set('to', this.dateTo);
        if (!this.hasCustomDateRange() && this.quickRange !== 'all') {
            params.set('window', this.quickRange);
        }

        const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
        window.history.replaceState({}, '', next);
    }

    updateStats() {
        if (this.storyCount) this.storyCount.textContent = String(this.articles.length);
        if (this.digestCount) this.digestCount.textContent = String(this.getDigestCount(this.articles));
        if (this.latestDate) {
            this.latestDate.textContent = this.articles.length > 0
                ? this.formatCompactDate(this.articles[0].date)
                : '-';
        }
    }

    updateSummary() {
        if (!this.summary || !this.summaryText || !this.summaryNote) return;

        if (this.articles.length === 0) {
            this.summary.hidden = true;
            return;
        }

        const topicText = this.activeTopics.size > 0
            ? ` in ${Array.from(this.activeTopics).map((tag) => TOPIC_LABELS[tag]).join(', ')}`
            : '';

        this.summaryText.textContent = `Showing ${this.filteredArticles.length} of ${this.articles.length} stories${topicText} across ${this.getDigestCount(this.filteredArticles)} digest dates.`;
        this.summaryNote.textContent = this.getRangeDescription();
        this.summary.hidden = false;
    }

    updateViewMetadata() {
        if (this.viewMode !== 'topics') return;

        const selectedTopic = this.activeTopics.size === 1 ? Array.from(this.activeTopics)[0] : '';
        const label = selectedTopic ? TOPIC_LABELS[selectedTopic] : 'All topics';

        if (this.viewKicker) this.viewKicker.textContent = 'Topic archive';
        if (this.viewTitle) this.viewTitle.textContent = selectedTopic ? label : 'Photography topics';
        if (this.viewIntro) {
            this.viewIntro.textContent = selectedTopic
                ? `A focused archive view for ${label.toLowerCase()} stories pulled from the photography digest feed.`
                : 'Open a single topic archive, then narrow it further by search or date range.';
        }
        if (this.viewPanelTitle) {
            this.viewPanelTitle.textContent = selectedTopic ? `${label} archive` : 'Browse by tag, not by source.';
        }
        if (this.viewPanelCopy) {
            this.viewPanelCopy.textContent = selectedTopic
                ? `This topic page keeps only the stories tagged ${label.toLowerCase()}, then lets you refine them by date.`
                : 'Topic pages are shareable archive views built from the same filtered digests as the main news page.';
        }
        if (this.viewPanelSecondary) {
            this.viewPanelSecondary.textContent = 'Each topic archive stays synced with the local digest files, so new relevant stories show up automatically after the pipeline refreshes.';
        }

        document.title = selectedTopic
            ? `${label} Topics - Kol Tregaskes Photography`
            : 'Photography Topics - Kol Tregaskes Photography';
    }

    renderArticles() {
        if (!this.groups || !this.empty) return;

        this.groups.innerHTML = '';

        if (this.articles.length === 0) {
            this.empty.hidden = false;
            this.empty.querySelector('strong').textContent = 'No digests have landed yet.';
            this.empty.querySelector('span').textContent = 'Once the photography-filtered pipeline writes fresh digests into news-digests, the archive will appear here automatically.';
            return;
        }

        if (this.filteredArticles.length === 0) {
            this.empty.hidden = false;
            this.empty.querySelector('strong').textContent = 'No stories match the current filters.';
            this.empty.querySelector('span').textContent = 'Try widening the topic selection or resetting the date range.';
            return;
        }

        this.empty.hidden = true;

        const grouped = new Map();
        this.filteredArticles.forEach((article) => {
            const existing = grouped.get(article.dateKey) || { label: article.dateLabel, articles: [] };
            existing.articles.push(article);
            grouped.set(article.dateKey, existing);
        });

        Array.from(grouped.entries())
            .sort((left, right) => right[0].localeCompare(left[0]))
            .forEach(([, group]) => {
                const section = document.createElement('section');
                section.className = 'news-group';

                const header = document.createElement('div');
                header.className = 'news-group-header';

                const title = document.createElement('h2');
                title.textContent = group.label;

                const meta = document.createElement('span');
                meta.textContent = `${group.articles.length} ${group.articles.length === 1 ? 'story' : 'stories'}`;

                header.append(title, meta);
                section.appendChild(header);

                const grid = document.createElement('div');
                grid.className = 'news-article-grid';
                group.articles.forEach((article) => {
                    grid.appendChild(this.createArticleCard(article));
                });

                section.appendChild(grid);
                this.groups.appendChild(section);
            });
    }

    createArticleCard(article) {
        const card = document.createElement('article');
        card.className = 'news-card';

        const topline = document.createElement('div');
        topline.className = 'news-card-topline';
        topline.innerHTML = `<span>${this.escapeHtml(article.compactDateLabel)}</span>`;

        const heading = document.createElement('h3');
        const link = document.createElement('a');
        link.href = article.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = article.title;
        heading.appendChild(link);

        card.append(topline, heading);

        if (article.summary) {
            const summary = document.createElement('p');
            summary.textContent = article.summary;
            card.appendChild(summary);
        }

        const footer = document.createElement('div');
        footer.className = 'news-card-footer';

        const tagList = document.createElement('div');
        tagList.className = 'news-tag-list';
        const shownTags = article.tags
            .filter((tag) => Object.prototype.hasOwnProperty.call(TOPIC_LABELS, tag))
            .slice(0, 3);

        shownTags.forEach((tag) => {
            const pill = document.createElement('a');
            pill.className = 'news-tag';
            pill.href = `topics.html?topic=${encodeURIComponent(tag)}`;
            pill.textContent = TOPIC_LABELS[tag];
            pill.setAttribute('aria-label', `View ${TOPIC_LABELS[tag]} topic archive`);
            tagList.appendChild(pill);
        });

        if (shownTags.length === 0) {
            const pill = document.createElement('a');
            pill.className = 'news-tag';
            pill.href = 'topics.html';
            pill.textContent = 'Photography';
            pill.setAttribute('aria-label', 'View all photography topics');
            tagList.appendChild(pill);
        }

        const readLink = document.createElement('a');
        readLink.className = 'news-read-link';
        readLink.href = article.url;
        readLink.target = '_blank';
        readLink.rel = 'noopener noreferrer';
        readLink.textContent = 'Open story';

        footer.append(tagList, readLink);
        card.appendChild(footer);
        return card;
    }

    getDigestCount(collection) {
        return new Set(collection.map((article) => article.dateKey)).size;
    }

    getRangeDescription() {
        if (this.dateFrom || this.dateTo) {
            const from = this.dateFrom || 'the start';
            const to = this.dateTo || 'today';
            return `Date range: ${from} to ${to}`;
        }

        const range = QUICK_RANGES.find((entry) => entry.key === this.quickRange);
        return range ? range.label : 'All available';
    }

    formatDateLabel(date) {
        return date.toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    formatCompactDate(date) {
        return date.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short'
        });
    }

    formatCardDate(date) {
        return date.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    }

    extractSource(url) {
        try {
            const hostname = new URL(url).hostname.replace(/^www\./, '');
            return hostname.split('.')[0];
        } catch {
            return 'Unknown';
        }
    }

    decodeEntities(value) {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = value;
        return textarea.value;
    }

    normalizeText(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\u200b/g, '')
            .replace(/Ã¢â‚¬â€|â€”|â€“/g, '-')
            .replace(/Ã¢â‚¬Ëœ|â€˜|Ã¢â‚¬â„¢|â€™/g, "'")
            .replace(/Ã¢â‚¬Å“|â€œ|Ã¢â‚¬Â|â€/g, '"')
            .replace(/Ã¢â‚¬Â¦|â€¦/g, '...')
            .replace(/Ã¢â€ â€™|â†’/g, '->')
            .replace(/Ã°Å¸â€Â¥|ðŸ”¥/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PhotographyNewsApp();
});
