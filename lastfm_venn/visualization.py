from __future__ import annotations

import matplotlib.pyplot as plt
from matplotlib.figure import Figure
from matplotlib_venn import venn2

from .analysis import OverlapResult


def create_venn_figure(result: OverlapResult, user1: str, user2: str, period_label: str) -> Figure:
    """Create a styled two-set Venn diagram figure."""
    fig, ax = plt.subplots(figsize=(9, 6))

    fig.patch.set_facecolor("#f7f4ef")
    ax.set_facecolor("#fffaf5")

    venn = venn2(
        subsets=(len(result.user1_only), len(result.user2_only), len(result.overlap)),
        set_labels=(user1, user2),
        ax=ax,
    )

    patch_styles = {
        "10": "#ff8a65",
        "01": "#4fc3f7",
        "11": "#9ccc65",
    }
    for patch_id, color in patch_styles.items():
        patch = venn.get_patch_by_id(patch_id)
        if patch is not None:
            patch.set_color(color)
            patch.set_alpha(0.72)

    for label in venn.set_labels or []:
        if label is not None:
            label.set_fontsize(14)
            label.set_fontweight("bold")

    for label in venn.subset_labels or []:
        if label is not None:
            label.set_fontsize(13)
            label.set_fontweight("bold")

    denom = len(result.user1_only) + len(result.user2_only) + len(result.overlap)
    overlap_pct = (len(result.overlap) / denom * 100) if denom else 0

    ax.set_title(
        f"Artist Overlap ({period_label})",
        fontsize=20,
        weight="bold",
        color="#2f2a24",
        pad=20,
    )
    ax.text(
        0.5,
        -0.08,
        f"Shared artists: {len(result.overlap)} ({overlap_pct:.1f}% of combined unique set)",
        transform=ax.transAxes,
        ha="center",
        fontsize=12,
        color="#5f574d",
    )

    ax.set_axis_off()
    fig.tight_layout()
    return fig
