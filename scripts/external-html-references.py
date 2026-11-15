"""Tokenise HTML with the standard library; decode attribute references once."""
import html
from html.entities import html5
from html.parser import HTMLParser
import json
import re
import sys

SPACE = "\t\n\f\r "
ENTITY = re.compile(r"&(#(?:[xX][0-9a-fA-F]+|[0-9]+);?|[A-Za-z][A-Za-z0-9]*;?)")


def decode_attribute(value):
    # Adapted from PR #40's privacy helper. HTMLParser's decoded attrs use
    # text-context unescape; use raw attribute boundaries for attribute context.
    def replace(match):
        token = match[1]
        if token.startswith("#"):
            return html.unescape(match[0])
        for length in range(len(token), 0, -1):
            name = token[:length]
            if name not in html5:
                continue
            following = token[length:length + 1] or value[match.end():match.end() + 1]
            if not name.endswith(";") and following and following in "=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz":
                return match[0]
            return html5[name] + token[length:]
        return match[0]
    return ENTITY.sub(replace, value)


class References(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.references = []
        self.base = None
        self.problems = 0

    def handle_starttag(self, tag, _):
        raw = self.get_starttag_text()
        pos = re.match(r"<[^\t\n\f\r />]+", raw).end()
        attrs = []
        while pos < len(raw):
            while pos < len(raw) and raw[pos] in SPACE:
                pos += 1
            if raw[pos:] in (">", "/>"):
                break
            start = pos
            while pos < len(raw) and raw[pos] not in SPACE + "/>=":
                pos += 1
            if start == pos:
                self.problems += 1
                pos += 1
                continue
            name = raw[start:pos].lower()
            if any(char in name for char in "<\"'`\0"):
                self.problems += 1
            while pos < len(raw) and raw[pos] in SPACE:
                pos += 1
            value = ""
            if pos < len(raw) and raw[pos] == "=":
                pos += 1
                while pos < len(raw) and raw[pos] in SPACE:
                    pos += 1
                quote = raw[pos:pos + 1]
                if quote in ("'", '"'):
                    pos += 1
                    start = pos
                    while pos < len(raw) and raw[pos] != quote:
                        pos += 1
                    value = raw[start:pos]
                    if pos == len(raw):
                        self.problems += 1
                    else:
                        pos += 1
                else:
                    start = pos
                    while pos < len(raw) and raw[pos] not in SPACE + ">":
                        pos += 1
                    value = raw[start:pos]
                    if not value or any(char in value for char in "<\"'`="):
                        self.problems += 1
            attrs.append((name, decode_attribute(value)))
        # Keep ALL duplicate URL attributes conservatively. The first rel/base
        # attribute controls browser semantics, but no later URL is discarded.
        first = {}
        for name, value in attrs:
            first.setdefault(name, value)
        if tag == "base" and self.base is None and "href" in first:
            self.base = first["href"]
        rel = set(re.split(r"[\t\n\f\r ]+", first.get("rel", "").lower().strip(SPACE))) - {""}
        hint = tag == "link" and rel and rel <= {"preconnect", "dns-prefetch", "preload"}
        for name, value in attrs:
            if name in {"href", "src", "srcset", "imagesrcset"} and not (hint and name == "href"):
                self.references.append({"attribute": name, "value": value})

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_data(self, data):
        # An incomplete tag is delivered as data by HTMLParser on close.
        # Unsupported/broken markup must not turn a partial crawl into a pass.
        if not self.cdata_elem and re.search(r"<[A-Za-z!/?]", data):
            self.problems += 1

    def unknown_decl(self, data):
        self.problems += 1


try:
    source = sys.stdin.buffer.read().decode("utf-8")
    parser = References()
    parser.feed(source)
    if parser.rawdata.startswith("<") and not parser.cdata_elem:
        parser.problems += 1
    parser.close()
    if "\0" in source:
        parser.problems += 1
    print(json.dumps({"version": 1, "base": parser.base, "references": parser.references, "problems": parser.problems}))
except Exception:
    print("Cannot tokenise HTML references", file=sys.stderr)
    sys.exit(1)
