"""Openly licensed photo search: Openverse and Wikimedia Commons, keyless.

Licence policy (see README.md): keep only CC0, Public Domain Mark / public domain, CC BY and
CC BY-SA. Anything NonCommercial or NoDerivatives, GFDL-only, "fair use" or unknown is dropped.

Every response is cached on disk, and each host is hit at most once a second (Openverse's
anonymous limit is 20 a minute / 200 a day, so it gets one request every 3.2 s and a daily cap).
"""

from __future__ import annotations

import hashlib
import html
import json
import re
import threading
import time
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path

USER_AGENT = (
    "CastcutPoseRefs/1.0 (pose reference harvester for the Castcut app; "
    "https://github.com/doodersrage/castcut; one request a second)"
)

ALLOWED_LICENCES = ("cc0", "pdm", "by", "by-sa")

# Minimum gap between requests to one host, seconds.
HOST_GAP = {"api.openverse.org": 3.2}
DEFAULT_GAP = 1.05


@dataclass
class Photo:
    source: str  # "openverse" | "commons"
    id: str
    title: str
    creator: str
    creator_url: str
    licence: str  # one of ALLOWED_LICENCES
    licence_version: str
    licence_url: str
    landing_url: str
    image_url: str
    provider: str
    width: int
    height: int
    query: str
    restrictions: str = ""

    def to_json(self) -> dict:
        return asdict(self)


class Http:
    def __init__(self, cache: Path, openverse_budget: int = 180):
        self.cache = cache
        self.cache.mkdir(parents=True, exist_ok=True)
        self.last: dict[str, float] = {}
        self.locks: dict[str, threading.Lock] = {}
        self.guard = threading.Lock()
        self.openverse_left = openverse_budget

    def _lock(self, host: str) -> threading.Lock:
        with self.guard:
            return self.locks.setdefault(host, threading.Lock())

    def _wait(self, host: str) -> None:
        gap = HOST_GAP.get(host, DEFAULT_GAP)
        since = time.monotonic() - self.last.get(host, 0.0)
        if since < gap:
            time.sleep(gap - since)
        self.last[host] = time.monotonic()

    def prefetch(self, urls: list[str]) -> None:
        """Download images ahead, one thread per host (each host still one request a second)."""
        by_host: dict[str, list[str]] = {}
        for url in urls:
            by_host.setdefault(urllib.parse.urlparse(url).netloc, []).append(url)

        def run(batch: list[str]) -> None:
            for url in batch:
                try:
                    self.get(url, binary=True)
                except Exception:  # noqa: BLE001 — the evaluation logs the failure
                    pass

        threads = [threading.Thread(target=run, args=(batch,)) for batch in by_host.values()]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

    def get(self, url: str, *, binary: bool = False, max_bytes: int = 20_000_000):
        key = hashlib.sha1(url.encode()).hexdigest()
        path = self.cache / key[:2] / (key + (".bin" if binary else ".json"))
        if path.exists():
            data = path.read_bytes()
            return data if binary else json.loads(data)
        fail = path.with_suffix(".fail")
        if fail.exists():
            raise RuntimeError(f"failed before: {fail.read_text()}")
        host = urllib.parse.urlparse(url).netloc
        if host == "api.openverse.org":
            if self.openverse_left <= 0:
                raise RuntimeError("Openverse daily budget used up")
            self.openverse_left -= 1
        last_error: Exception | None = None
        for attempt in range(3):
            with self._lock(host):
                if path.exists():
                    data = path.read_bytes()
                    return data if binary else json.loads(data)
                self._wait(host)
                request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
                try:
                    with urllib.request.urlopen(request, timeout=40) as response:
                        data = response.read(max_bytes + 1)
                except Exception as error:  # noqa: BLE001
                    response_error = error
                else:
                    response_error = None
            try:
                if response_error:
                    raise response_error
                if len(data) > max_bytes:
                    raise ValueError("too large")
                break
            except ValueError:
                fail.parent.mkdir(parents=True, exist_ok=True)
                fail.write_text("too large")
                raise
            except urllib.error.HTTPError as error:  # type: ignore[attr-defined]
                last_error = error
                if error.code in (429, 503):
                    time.sleep(30 * (attempt + 1))
                    continue
                fail.parent.mkdir(parents=True, exist_ok=True)
                fail.write_text(f"HTTP {error.code}")
                raise
            except Exception as error:  # network hiccup
                last_error = error
                time.sleep(3 * (attempt + 1))
        else:
            fail.parent.mkdir(parents=True, exist_ok=True)
            fail.write_text(str(last_error))
            raise RuntimeError(f"GET failed: {url}: {last_error}")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return data if binary else json.loads(data)


def _strip_html(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def _commons_licence(meta: dict) -> tuple[str, str, str] | None:
    """(licence, version, url) from Commons extmetadata, or None when not allowed."""
    value = lambda key: _strip_html((meta.get(key) or {}).get("value", ""))  # noqa: E731
    licence = value("License").lower()
    short = value("LicenseShortName")
    url = value("LicenseUrl")
    if not licence:
        return None
    if re.search(r"\bnc\b|-nc-|\bnd\b|-nd-|noncommercial|noderiv", licence + " " + short.lower()):
        return None
    m = re.match(r"cc-by-sa-(\d(?:\.\d)?)", licence)
    if m:
        return "by-sa", m.group(1), url or f"https://creativecommons.org/licenses/by-sa/{m.group(1)}/"
    m = re.match(r"cc-by-(\d(?:\.\d)?)", licence)
    if m:
        return "by", m.group(1), url or f"https://creativecommons.org/licenses/by/{m.group(1)}/"
    if licence.startswith("cc0"):
        return "cc0", "1.0", url or "https://creativecommons.org/publicdomain/zero/1.0/"
    if licence == "pd" or licence.startswith("pd-") or short.lower().startswith("public domain"):
        return "pdm", "1.0", url or "https://creativecommons.org/publicdomain/mark/1.0/"
    return None


def search_commons(http: Http, query: str, limit: int = 40, offset: int = 0) -> list[Photo]:
    params = {
        "action": "query",
        "format": "json",
        "generator": "search",
        # No "-painting -drawing …": those words sit in most file pages' boilerplate and cut the
        # hits ~99%. Paintings and prints are caught by the title filter and the vision check.
        "gsrsearch": f"{query} filetype:bitmap",
        "gsrnamespace": "6",
        "gsrlimit": str(limit),
        **({"gsroffset": str(offset)} if offset else {}),
        "prop": "imageinfo",
        "iiprop": "url|size|mime|extmetadata",
        "iiurlwidth": "1024",
        "iiextmetadatafilter": "License|LicenseShortName|LicenseUrl|Artist|ObjectName|Restrictions",
    }
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    data = http.get(url)
    pages = sorted((data.get("query") or {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
    photos: list[Photo] = []
    for page in pages:
        info = (page.get("imageinfo") or [{}])[0]
        if info.get("mime") not in ("image/jpeg", "image/png", "image/webp"):
            continue
        meta = info.get("extmetadata") or {}
        licence = _commons_licence(meta)
        if not licence:
            continue
        title = _strip_html((meta.get("ObjectName") or {}).get("value", "")) or page["title"].removeprefix(
            "File:"
        ).rsplit(".", 1)[0]
        artist_html = (meta.get("Artist") or {}).get("value", "")
        link = re.search(r'href="([^"]+)"', artist_html or "")
        creator_url = link.group(1) if link else ""
        if creator_url.startswith("//"):
            creator_url = "https:" + creator_url
        photos.append(
            Photo(
                source="commons",
                id=str(page.get("pageid")),
                title=title[:200],
                creator=_strip_html(artist_html)[:160] or "Unknown",
                creator_url=creator_url,
                licence=licence[0],
                licence_version=licence[1],
                licence_url=licence[2],
                landing_url=info.get("descriptionurl", ""),
                image_url=info.get("thumburl") or info.get("url", ""),
                provider="wikimedia",
                width=int(info.get("thumbwidth") or info.get("width") or 0),
                height=int(info.get("thumbheight") or info.get("height") or 0),
                query=query,
                restrictions=_strip_html((meta.get("Restrictions") or {}).get("value", "")),
            )
        )
    return photos


def search_openverse(
    http: Http, query: str, limit: int = 20, page: int = 1, photos_only: bool = True
) -> list[Photo]:
    """`photos_only=False` drops Openverse's `category=photograph` filter: most Flickr images carry
    no category, so it hides them (the title filter and the vision check still catch drawings)."""
    params = {
        "q": query,
        "license": ",".join(ALLOWED_LICENCES),
        "page_size": str(min(limit, 20)),
        "mature": "false",
        **({"license_type": "commercial,modification", "category": "photograph"} if photos_only else {}),
        **({"page": str(page)} if page > 1 else {}),
    }
    url = "https://api.openverse.org/v1/images/?" + urllib.parse.urlencode(params)
    data = http.get(url)
    photos: list[Photo] = []
    for row in data.get("results", []):
        licence = (row.get("license") or "").lower()
        if licence not in ALLOWED_LICENCES or row.get("mature"):
            continue
        photos.append(
            Photo(
                source="openverse",
                id=row["id"],
                title=(row.get("title") or "Untitled")[:200],
                creator=(row.get("creator") or "Unknown")[:160],
                creator_url=row.get("creator_url") or "",
                licence=licence,
                licence_version=row.get("license_version") or "",
                licence_url=row.get("license_url") or "",
                landing_url=row.get("foreign_landing_url") or "",
                image_url=row.get("url") or "",
                provider=row.get("provider") or row.get("source") or "",
                width=int(row.get("width") or 0),
                height=int(row.get("height") or 0),
                query=query,
            )
        )
    return photos


def photo_key(photo: Photo) -> str:
    """One key per picture across sources (Openverse indexes Commons too)."""
    landing = photo.landing_url.lower().split("?")[0].rstrip("/")
    m = re.search(r"commons\.wikimedia\.org/wiki/(file:.+)$", landing)
    if m:
        return "commons:" + urllib.parse.unquote(m.group(1)).replace(" ", "_")
    m = re.search(r"flickr\.com/photos/[^/]+/(\d+)", landing)
    if m:
        return "flickr:" + m.group(1)
    return landing or photo.image_url
