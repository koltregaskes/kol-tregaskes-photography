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

class PhotographyNewsApp {
    constructor() {
        this.articles = [];
        this.filteredArticles = [];
        this.sources = new Map();
        this.activeTopics = new Set();
        this.searchTerm = '';
        this.init();
    }

    async init() {
        this.cacheElements();
        this.bindEvents();
        await this.loadArticles();
        this.renderFilters();
        this.applyFilters();
    }

    cacheElements() {
        this.loading = document.getElementById('news-loading');
        this.empty = document.getElementById('news-empty');
        this.groups = document.getElementById('news-groups');
        this.summary = document.getElementById('news-summary');
        this.summaryText = document.getElementById('news-summary-text');
        this.searchInput = document.getElementById('news-search');
        this.topicFilters = document.getElementById('news-topic-filters');
        this.sourceFilters = document.getElementById('news-source-filters');
        this.storyCount = document.getElementById('news-story-count');
        this.sourceCount = document.getElementById('news-source-count');
        this.latestDate = document.getElementById('news-latest-date');
        this.clearButton = document.getElementById('news-clear');
    }

    bindEvents() {
        this.searchInput?.addEventListener('input', (event) => {
            this.searchTerm = event.target.value.trim().toLowerCase();
            this.applyFilters();
        });

        this.clearButton?.addEventListener('click', () => {
            this.searchTerm = '';
            this.activeTopics.clear();
            if (this.searchInput) this.searchInput.value = '';
            this.sourceFilters?.querySelectorAll('input[type="checkbox"]').forEach((input) => {
                input.checked = true;
            });
            this.renderFilters();
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
        this.articles = results.flat().sort((left, right) => {
            if (right.date.getTime() !== left.date.getTime()) {
                return right.date.getTime() - left.date.getTime();
            }
            return (right.score || 0) - (left.score || 0);
        });

        this.filteredArticles = [...this.articles];
        this.sources.clear();

        this.articles.forEach((article) => {
            const currentCount = this.sources.get(article.source) || 0;
            this.sources.set(article.source, currentCount + 1);
        });

        this.updateStats();
        if (this.loading) this.loading.hidden = true;
    }

    async loadDigestList() {
        const files = new Set();

        try {
            const response = await fetch('news-digests/index.json', { cache: 'no-store' });
            if (response.ok) {
                const payload = await response.json();
                if (Array.isArray(payload.files)) {
                    payload.files.forEach((file) => files.add(file));
                }
            }
        } catch {
            // Manifest is optional. We always fall back to recent date scanning.
        }

        this.generateFallbackDigestList(21).forEach((file) => files.add(file));
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
            .filter((article) => article !== null);
    }

    parseArticleSection(section, digestDate) {
        if (!section.startsWith('## ')) return null;

        const linkMatch = section.match(/^##\s+\[([\s\S]+?)\]\((https?:\/\/[^\s)]+)\)/m);
        if (!linkMatch) return null;

        const title = this.normalizeText(this.decodeEntities(linkMatch[1]));
        const url = linkMatch[2];
        const sourceMatch = section.match(/\*([^*]+)\*\s+\|\s+Score:\s+([0-9.]+)/m);
        const source = sourceMatch ? this.normalizeText(this.decodeEntities(sourceMatch[1])) : this.extractSource(url);
        const score = sourceMatch ? Number.parseFloat(sourceMatch[2]) : null;
        const tagsMatch = section.match(/^Tags:\s*(.+)$/m);
        const tags = tagsMatch
            ? tagsMatch[1].split(',').map((tag) => tag.trim()).filter(Boolean)
            : [];

        const summary = this.buildSummary(
            section
                .replace(linkMatch[0], '')
                .replace(sourceMatch ? sourceMatch[0] : '', '')
                .replace(tagsMatch ? tagsMatch[0] : '')
        );

        return {
            title,
            url,
            source,
            score,
            date: digestDate,
            dateKey: digestDate.toISOString().slice(0, 10),
            dateLabel: this.formatDateLabel(digestDate),
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

    buildSummary(rawBody) {
        const lines = rawBody
            .split('\n')
            .map((line) => this.normalizeText(this.decodeEntities(line)))
            .filter(Boolean)
            .filter((line) => !/^by$/i.test(line))
            .filter((line) => !/^published\b/i.test(line))
            .filter((line) => !/^(opinion|review|lens|nasa|artemis|gear|guide)$/i.test(line))
            .filter((line) => !/^[A-Z0-9\s/&-]{3,}$/.test(line));

        if (lines.length === 0) return '';

        const summary = lines.join(' ');
        return summary.length > 240 ? `${summary.slice(0, 237).trim()}...` : summary;
    }

    renderFilters() {
        this.renderTopicFilters();
        this.renderSourceFilters();
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
        this.topicFilters.appendChild(this.createTopicButton('all', 'All Stories', this.activeTopics.size === 0));

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
                this.activeTopics.add(tag);
            }
            this.renderTopicFilters();
            this.applyFilters();
        });
        return button;
    }

    renderSourceFilters() {
        if (!this.sourceFilters) return;

        const currentInputs = Array.from(this.sourceFilters.querySelectorAll('input[type="checkbox"]'));
        const selectedSources = currentInputs.length > 0 ? new Set(this.getSelectedSources()) : null;
        this.sourceFilters.innerHTML = '';

        Array.from(this.sources.entries())
            .sort((left, right) => left[0].localeCompare(right[0]))
            .forEach(([source, count]) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'news-source-toggle';

                const label = document.createElement('label');
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.value = source;
                input.checked = selectedSources === null || selectedSources.has(source);
                input.addEventListener('change', () => this.applyFilters());

                const name = document.createElement('span');
                name.textContent = source;
                label.append(input, name);

                const meta = document.createElement('span');
                meta.className = 'news-source-count';
                meta.textContent = `${count}`;

                wrapper.append(label, meta);
                this.sourceFilters.appendChild(wrapper);
            });
    }

    getSelectedSources() {
        return Array.from(this.sourceFilters?.querySelectorAll('input:checked') || []).map((input) => input.value);
    }

    applyFilters() {
        const sourceInputs = Array.from(this.sourceFilters?.querySelectorAll('input[type="checkbox"]') || []);
        const selectedSources = new Set(sourceInputs.filter((input) => input.checked).map((input) => input.value));
        const hasSourceControls = sourceInputs.length > 0;

        this.filteredArticles = this.articles.filter((article) => {
            const matchesSearch = !this.searchTerm || [
                article.title,
                article.source,
                article.summary,
                article.tags.join(' ')
            ].join(' ').toLowerCase().includes(this.searchTerm);

            const matchesTopic = this.activeTopics.size === 0
                || article.tags.some((tag) => this.activeTopics.has(tag));

            const matchesSource = !hasSourceControls || selectedSources.has(article.source);

            return matchesSearch && matchesTopic && matchesSource;
        });

        this.updateSummary();
        this.renderArticles();
    }

    updateStats() {
        if (this.storyCount) this.storyCount.textContent = String(this.articles.length);
        if (this.sourceCount) this.sourceCount.textContent = String(this.sources.size);
        if (this.latestDate) {
            this.latestDate.textContent = this.articles.length > 0
                ? this.formatCompactDate(this.articles[0].date)
                : '-';
        }
    }

    updateSummary() {
        if (!this.summary || !this.summaryText) return;

        if (this.articles.length === 0) {
            this.summary.hidden = true;
            return;
        }

        const topicText = this.activeTopics.size > 0
            ? ` in ${Array.from(this.activeTopics).map((tag) => TOPIC_LABELS[tag]).join(', ')}`
            : '';

        this.summaryText.textContent = `Showing ${this.filteredArticles.length} of ${this.articles.length} stories${topicText}.`;
        this.summary.hidden = false;
    }

    renderArticles() {
        if (!this.groups || !this.empty) return;

        this.groups.innerHTML = '';

        if (this.articles.length === 0) {
            this.empty.hidden = false;
            this.empty.querySelector('strong').textContent = 'No digests have landed yet.';
            this.empty.querySelector('span').textContent = 'Once the photography-filtered newspipe writes a digest into news-digests, the feed will appear here automatically.';
            return;
        }

        if (this.filteredArticles.length === 0) {
            this.empty.hidden = false;
            this.empty.querySelector('strong').textContent = 'No stories match the current filters.';
            this.empty.querySelector('span').textContent = 'Try clearing the search or re-enabling a source.';
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
                meta.textContent = `${group.articles.length} story${group.articles.length === 1 ? '' : 'ies'}`;

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
        topline.innerHTML = `<span><strong>${this.escapeHtml(article.source)}</strong></span><span>${article.score ? `Signal ${article.score.toFixed(2)}` : 'Digest story'}</span>`;

        const heading = document.createElement('h3');
        const link = document.createElement('a');
        link.href = article.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = article.title;
        heading.appendChild(link);

        const summary = document.createElement('p');
        summary.textContent = article.summary || 'Open the original article for the full write-up.';

        const footer = document.createElement('div');
        footer.className = 'news-card-footer';

        const tagList = document.createElement('div');
        tagList.className = 'news-tag-list';
        const shownTags = article.tags
            .filter((tag) => Object.prototype.hasOwnProperty.call(TOPIC_LABELS, tag))
            .slice(0, 3);

        shownTags.forEach((tag) => {
            const pill = document.createElement('span');
            pill.className = 'news-tag';
            pill.textContent = TOPIC_LABELS[tag];
            tagList.appendChild(pill);
        });

        if (shownTags.length === 0) {
            const pill = document.createElement('span');
            pill.className = 'news-tag';
            pill.textContent = 'Photography';
            tagList.appendChild(pill);
        }

        const readLink = document.createElement('a');
        readLink.className = 'news-read-link';
        readLink.href = article.url;
        readLink.target = '_blank';
        readLink.rel = 'noopener noreferrer';
        readLink.textContent = 'Open story';

        footer.append(tagList, readLink);
        card.append(topline, heading, summary, footer);
        return card;
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
        let output = String(value || '');
        output = output
            .replace(/\u00a0/g, ' ')
            .replace(/\u200b/g, '');

        return output.replace(/\s+/g, ' ').trim();
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
