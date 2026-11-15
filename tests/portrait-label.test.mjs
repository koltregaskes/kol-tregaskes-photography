import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../about.html', import.meta.url), 'utf8');
test('the initials tile is decorative and does not announce a nonexistent portrait', () => {
    const tile = html.match(/<div\b[^>]*class="about-portrait-tile"[^>]*>/)?.[0];
    assert.ok(tile, 'keep the decorative tile and layout');
    assert.match(tile, /aria-hidden="true"/);
    assert.doesNotMatch(tile, /\brole=|\baria-label=|\btabindex=/);
});
test('the photographer remains named in visible text outside the decorative tile', () => {
    assert.match(html, /<div class="about-text">\s*<h2>Kol Tregaskes<\/h2>/);
    assert.doesNotMatch(html, /portrait placeholder/i);
});
