#!/usr/bin/env python3
"""Offline SEO gate: HTML, real PNG dimensions, sitemap coverage and RSS XML."""
import json
import os
import re
import struct
import sys
import zlib
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse, urljoin

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
SITE = ROOT / "site" if (ROOT / "scripts/build.mjs").exists() else ROOT
SM = "http://www.sitemaps.org/schemas/sitemap/0.9"
ATOM = "http://www.w3.org/2005/Atom"


class Head(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.meta, self.links = {}, []
        self.feed(text.split("</head>", 1)[0])

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta":
            self.meta.setdefault(a.get("name", a.get("property", "")), []).append(a.get("content", ""))
        elif tag == "link":
            self.links.append(a)

    def one(self, name):
        values = self.meta.get(name, [])
        assert len(values) == 1 and values[0], f"Missing or duplicate {name}"
        return values[0]


def local(url):
    relative = unquote(urlparse(url).path).removeprefix(base_path).lstrip("/")
    path = SITE / relative
    return path / "index.html" if path.is_dir() else path


def robots_allows(text, url, agent):
    # RFC 9309: longest matching agent/rule; Allow wins equal specificity.
    groups, agents, rules = [], [], []
    for raw in text.splitlines() + [""]:
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        key, sep, value = line.partition(":")
        key, value = key.strip().lower(), value.strip()
        if key == "user-agent":
            if rules:
                groups.append((agents, rules))
                agents, rules = [], []
            agents.append(value.lower())
        elif key in ("allow", "disallow") and value:
            rules.append((key == "allow", value))
    if agents:
        groups.append((agents, rules))
    matches = [(max((len(a) for a in names if a != "*" and a in agent.lower()), default=0), names, rules) for names, rules in groups]
    specificity = max((m[0] for m in matches), default=0)
    selected = [rules for score, names, rules in matches if score == specificity and (score > 0 or "*" in names)]
    target = unquote(urlparse(url).path)
    hits = []
    for rules in selected:
        for allow, pattern in rules:
            anchored = pattern.endswith("$")
            pattern = unquote(pattern.rstrip("$"))
            regex = re.escape(pattern).replace(r"\*", ".*") + ("$" if anchored else "")
            if re.match(regex, target):
                hits.append((len(pattern.replace("*", "")), allow))
    return max(hits, default=(0, True))[1]


def validate_png(raw):
    assert raw[:8] == b"\x89PNG\r\n\x1a\n", "Invalid PNG signature"
    offset, compressed, ended = 8, bytearray(), False
    while offset + 12 <= len(raw):
        length = struct.unpack(">I", raw[offset:offset + 4])[0]
        kind = raw[offset + 4:offset + 8]
        end = offset + 12 + length
        assert end <= len(raw), "Truncated PNG chunk"
        data = raw[offset + 8:offset + 8 + length]
        checksum = struct.unpack(">I", raw[end - 4:end])[0]
        assert zlib.crc32(kind + data) & 0xffffffff == checksum, "PNG CRC mismatch"
        if kind == b"IDAT":
            compressed.extend(data)
        offset = end
        if kind == b"IEND":
            ended = True
            break
    assert ended and offset == len(raw) and compressed, "Incomplete PNG image"
    assert zlib.decompress(compressed), "Empty PNG pixel data"


if __name__ == "__main__":
    domain = (os.environ.get("CUSTOM_DOMAIN") or (ROOT / "CNAME").read_text(encoding="utf-8").strip()).removeprefix("https://").removeprefix("http://").rstrip("/")
    base = f"https://{domain}"
    base_path = urlparse(base).path
    expected, checked_images = set(), set()
    for page in sorted(SITE.rglob("*.html")):
        if any(part.startswith(".") or part in ("node_modules", "design", "docs", "scripts", "tests") for part in page.relative_to(SITE).parts):
            continue
        text = page.read_text(encoding="utf-8")
        head = Head(text)
        if any("noindex" in value for value in head.meta.get("robots", [])) or re.search(r'http-equiv=["\']refresh', text, re.I):
            continue
        relative = page.relative_to(SITE).as_posix()
        if relative == "index.html":
            relative = ""
        elif relative.endswith("/index.html"):
            relative = relative[:-10]
        url = base + "/" + relative
        try:
            canonical = [a["href"] for a in head.links if a.get("rel") == "canonical"]
            assert canonical == [url], f"Wrong canonical: {canonical}"
            assert url not in expected, "Duplicate canonical"
            expected.add(url)
            assert head.one("og:url") == url
            for key in ("description", "og:title", "og:description", "og:type", "og:site_name", "twitter:title", "twitter:description", "og:image:alt", "twitter:image:alt"):
                head.one(key)
            assert head.one("twitter:card") == "summary_large_image"
            image = head.one("og:image")
            assert image == head.one("twitter:image") and image.startswith(base + "/") and image.endswith(".png")
            image_path = local(image)
            raw = image_path.read_bytes()
            if image_path not in checked_images:
                validate_png(raw)
                checked_images.add(image_path)
            assert raw[:8] == b"\x89PNG\r\n\x1a\n" and struct.unpack(">II", raw[16:24]) == (1200, 630), "Social image must be a 1200x630 PNG"
            assert head.one("og:image:width") == "1200" and head.one("og:image:height") == "630"
            assert [a["href"] for a in head.links if a.get("type") == "application/rss+xml"] == [base + "/rss.xml"]
            schemas = [json.loads(m) for m in re.findall(r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', text, re.S)]
            assert schemas, "Missing JSON-LD"
            nodes = [node for schema in schemas for node in schema.get("@graph", [schema])]
            identities = [node["@id"] for node in nodes if node.get("@id")]
            assert len(identities) == len(set(identities)), "Duplicate JSON-LD identities"
            assert any(node.get("url") == url or node.get("@id", "").split("#")[0] == url or node.get("mainEntityOfPage") == url or isinstance(node.get("mainEntityOfPage"), dict) and node["mainEntityOfPage"].get("@id") == url for node in nodes), "JSON-LD missing the page URL"
            if relative.startswith("posts/") and relative != "posts/":
                assert any(n.get("@type") == "BlogPosting" and n.get("headline") and n.get("author") and n.get("datePublished") for n in nodes), "Missing article metadata"
        except (AssertionError, KeyError, ValueError, zlib.error) as error:
            raise SystemExit(f"{relative or 'index.html'}: {error}") from error
    sitemap = ET.parse(SITE / "sitemap.xml").getroot()
    assert sitemap.tag == f"{{{SM}}}urlset"
    urls = [node.text for node in sitemap.findall(f"{{{SM}}}url/{{{SM}}}loc")]
    assert len(urls) == len(set(urls)) and set(urls) == expected, f"Sitemap coverage mismatch: {set(urls) ^ expected}"
    rss = ET.parse(SITE / "rss.xml").getroot()
    assert rss.tag == "rss" and rss.get("version") == "2.0"
    channel = rss.find("channel")
    for key in ("title", "link", "description", "language"):
        assert channel.findtext(key)
    assert channel.find(f"{{{ATOM}}}link").get("href") == base + "/rss.xml"
    items = channel.findall("item")
    assert items, "Empty RSS"
    guids, dates = set(), []
    for item in items:
        for key in ("title", "link", "guid", "pubDate"):
            assert item.findtext(key), f"RSS item missing {key}"
        link, guid = item.findtext("link"), item.findtext("guid")
        assert guid not in guids and link.startswith("https://")
        guids.add(guid)
        dates.append(parsedate_to_datetime(item.findtext("pubDate")))
        if link.startswith(base + "/"):
            assert local(link).exists(), f"RSS link has no local target: {link}"
    assert dates == sorted(dates, reverse=True), "RSS dates are not newest first"
    robots = (SITE / "robots.txt").read_text(encoding="utf-8")
    assert f"Sitemap: {base}/sitemap.xml" in robots
    assert re.search(r"^User-agent:\s*\*\s*$", robots, re.M | re.I), "robots.txt missing wildcard user agent"
    for url in expected:
        for agent in ("launch-check", "googlebot", "bingbot"):
            assert robots_allows(robots, url, agent), f"robots.txt blocked sitemap URL: {url} ({agent})"
    llms = (SITE / "llms.txt").read_text(encoding="utf-8")
    assert llms.strip().startswith("# "), "llms.txt missing its readable title/content"
    discovery_links = re.findall(r"\[[^\]]+\]\(([^)]+)\)", llms)
    assert discovery_links, "llms.txt has no discovery links"
    for target in discovery_links:
        url = urljoin(base + "/llms.txt", target)
        if urlparse(url).netloc == urlparse(base).netloc:
            assert url.startswith(base + "/") and local(url).exists(), f"llms.txt has a broken internal target: {target}"
    assert not re.search(r"^Disallow:\s*/\s*$", robots, re.M)
    print(f"SEO checks passed: {len(expected)} pages, {len(urls)} sitemap URLs, {len(items)} RSS items.")
