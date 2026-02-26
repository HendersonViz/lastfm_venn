from __future__ import annotations

from dataclasses import dataclass

import requests


class LastFMError(Exception):
    """Raised when Last.fm API returns an error or malformed response."""


@dataclass
class LastFMClient:
    api_key: str
    base_url: str = "https://ws.audioscrobbler.com/2.0/"

    def get_top_artists(self, username: str, period: str, limit: int = 300) -> dict[str, int]:
        """Fetch top artists for a user and return a name->playcount mapping."""
        if limit < 1:
            return {}

        per_page = min(limit, 500)
        page = 1
        artists: dict[str, int] = {}

        while len(artists) < limit:
            params = {
                "method": "user.gettopartists",
                "user": username,
                "period": period,
                "api_key": self.api_key,
                "format": "json",
                "limit": per_page,
                "page": page,
            }
            try:
                response = requests.get(self.base_url, params=params, timeout=15)
                response.raise_for_status()
                data = response.json()
            except requests.RequestException as exc:
                raise LastFMError(f"Network/API request failed: {exc}") from exc
            except ValueError as exc:
                raise LastFMError("Last.fm API returned a non-JSON response") from exc

            if "error" in data:
                raise LastFMError(data.get("message", "Unknown Last.fm error"))

            topartists = data.get("topartists", {})
            items = topartists.get("artist", [])

            if isinstance(items, dict):
                items = [items]

            if not items:
                break

            for item in items:
                name = item.get("name")
                if not name:
                    continue
                try:
                    playcount = int(item.get("playcount", 0))
                except (TypeError, ValueError):
                    playcount = 0
                artists[name] = max(artists.get(name, 0), playcount)
                if len(artists) >= limit:
                    break

            attr = topartists.get("@attr", {})
            try:
                total_pages = int(attr.get("totalPages", 1))
            except (TypeError, ValueError):
                total_pages = 1
            if page >= total_pages:
                break
            page += 1

        return artists
