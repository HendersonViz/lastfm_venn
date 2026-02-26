from __future__ import annotations

from dataclasses import dataclass
from math import isfinite


@dataclass
class OverlapResult:
    user1_only: set[str]
    user2_only: set[str]
    overlap: set[str]
    ranked_overlap: list[dict[str, int | float | str]]

    @property
    def user1_total(self) -> int:
        return len(self.user1_only) + len(self.overlap)

    @property
    def user2_total(self) -> int:
        return len(self.user2_only) + len(self.overlap)


def compute_overlap(user1_artists: dict[str, int], user2_artists: dict[str, int]) -> OverlapResult:
    """
    Compute set overlap and return artists ranked by a match-quality proxy.

    The proxy uses harmonic mean of playcounts, which rewards artists both users
    listen to frequently and penalizes one-sided matches (e.g. 1 vs 1000 plays).
    """
    set1 = set(user1_artists)
    set2 = set(user2_artists)

    overlap = set1 & set2
    user1_only = set1 - overlap
    user2_only = set2 - overlap

    ranked = []
    for artist in overlap:
        u1 = user1_artists.get(artist, 0)
        u2 = user2_artists.get(artist, 0)
        max_playcount = max(u1, u2)
        min_playcount = min(u1, u2)

        if u1 > 0 and u2 > 0:
            harmonic_mean = (2 * u1 * u2) / (u1 + u2)
        else:
            harmonic_mean = 0.0

        balance_ratio = (min_playcount / max_playcount) if max_playcount else 0.0
        if not isfinite(harmonic_mean):
            harmonic_mean = 0.0

        ranked.append(
            {
                "artist": artist,
                "user1_playcount": u1,
                "user2_playcount": u2,
                "min_playcount": min_playcount,
                "balance_ratio": round(balance_ratio, 4),
                "match_score": round(harmonic_mean, 2),
                "combined_playcount": u1 + u2,
            }
        )

    ranked.sort(
        key=lambda row: (
            row["match_score"],
            row["min_playcount"],
            row["combined_playcount"],
        ),
        reverse=True,
    )

    return OverlapResult(
        user1_only=user1_only,
        user2_only=user2_only,
        overlap=overlap,
        ranked_overlap=ranked,
    )
