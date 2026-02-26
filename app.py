from __future__ import annotations

import os

import pandas as pd
import streamlit as st

from lastfm_venn import LastFMClient, LastFMError, compute_overlap, create_venn_figure

ARTIST_LIMIT = 5000

PERIOD_OPTIONS = {
    "Last 7 days": "7day",
    "Last 1 month": "1month",
    "Last 3 months": "3month",
    "Last 6 months": "6month",
    "Last 12 months": "12month",
    "Overall": "overall",
}

EMOJI_STAGES = [
    "",
    "🔥",
    "🔥🎧",
    "🔥🎧✨",
    "🔥🎧✨🚀",
    "🔥🎧✨🚀🎆",
    "🔥🎧✨🚀🎆🪩",
    "🔥🎧✨🚀🎆🪩👑",
]

st.set_page_config(
    page_title="Last.fm Artist Overlap",
    page_icon=":notes:",
    layout="wide",
)

st.markdown(
    """
    <style>
    .stApp {
      background: radial-gradient(circle at top left, #fff8ef 0%, #f8f2ea 45%, #eef6f9 100%);
    }
    .block-container {
      padding-top: 2.0rem;
      padding-bottom: 2.0rem;
    }
    h1, h2, h3 {
      color: #2f2a24;
      letter-spacing: 0.2px;
    }
    [data-testid="stMetricValue"] {
      color: #2f2a24;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

st.title("Last.fm Artist Overlap Explorer")
st.caption("Compare two Last.fm users and visualize shared artists across timeframes.")
st.caption("Match score starts earning emojis above 100 and maxes out at 2000.")

api_key = os.getenv("LASTFM_API_KEY", "").strip()


def score_to_vibe(score: float) -> str:
    if score <= 100:
        return ""
    clamped = min(score, 2000.0)
    normalized = (clamped - 100.0) / 1900.0
    stage_idx = 1 + int(normalized * (len(EMOJI_STAGES) - 2))
    return EMOJI_STAGES[stage_idx]


@st.cache_data(ttl=1800, show_spinner=False)
def fetch_top_artists(api_key: str, username: str, period: str, limit: int) -> dict[str, int]:
    client = LastFMClient(api_key=api_key)
    return client.get_top_artists(username=username, period=period, limit=limit)

left_col, right_col = st.columns(2)
with left_col:
    user1 = st.text_input("Username #1", placeholder="e.g. alice")
with right_col:
    user2 = st.text_input("Username #2", placeholder="e.g. bob")

selected_labels = st.multiselect(
    "Timeframes",
    options=list(PERIOD_OPTIONS.keys()),
    default=["Last 7 days", "Last 1 month", "Overall"],
)

run = st.button("Generate Venn Diagrams", type="primary", use_container_width=True)

if run:
    if not api_key:
        st.error("LASTFM_API_KEY is not set in your environment.")
        st.stop()

    if not user1.strip() or not user2.strip():
        st.error("Please provide both Last.fm usernames.")
        st.stop()

    if not selected_labels:
        st.error("Select at least one timeframe.")
        st.stop()

    with st.spinner("Fetching artists and building diagrams..."):
        for label in selected_labels:
            period = PERIOD_OPTIONS[label]
            try:
                artists_user1 = fetch_top_artists(api_key, user1.strip(), period, ARTIST_LIMIT)
                artists_user2 = fetch_top_artists(api_key, user2.strip(), period, ARTIST_LIMIT)
            except LastFMError as exc:
                st.error(f"Last.fm error for '{label}': {exc}")
                continue
            except Exception as exc:
                st.error(f"Unexpected error for '{label}': {exc}")
                continue

            result = compute_overlap(artists_user1, artists_user2)
            top_match_score = float(result.ranked_overlap[0]["match_score"]) if result.ranked_overlap else 0.0

            st.subheader(label)
            m1, m2, m3, m4 = st.columns(4)
            m1.metric(f"{user1} unique artists", result.user1_total)
            m2.metric(f"{user2} unique artists", result.user2_total)
            m3.metric("Shared artists", len(result.overlap))
            m4.metric("Top match", f"{top_match_score:.1f} {score_to_vibe(top_match_score)}")

            viz_col, table_col = st.columns([1.2, 1])

            with viz_col:
                fig = create_venn_figure(result, user1=user1.strip(), user2=user2.strip(), period_label=label)
                st.pyplot(fig, use_container_width=True)

            with table_col:
                st.markdown("**Top shared artists (by match score)**")
                if result.ranked_overlap:
                    overlap_df = pd.DataFrame(result.ranked_overlap)
                    overlap_df["vibe"] = overlap_df["match_score"].apply(score_to_vibe)
                    overlap_df = overlap_df.rename(
                        columns={
                            "artist": "Artist",
                            "vibe": "Vibe",
                            "user1_playcount": f"{user1.strip()} plays",
                            "user2_playcount": f"{user2.strip()} plays",
                            "match_score": "Match score",
                            "combined_playcount": "Combined",
                        }
                    )
                    overlap_df = overlap_df[
                        [
                            "Artist",
                            "Vibe",
                            "Match score",
                            f"{user1.strip()} plays",
                            f"{user2.strip()} plays",
                            "Combined",
                        ]
                    ]
                    display_df = overlap_df.head(25).copy()
                    styled_df = (
                        display_df.style.background_gradient(subset=["Match score"], cmap="YlOrRd")
                        .format({"Match score": "{:.2f}"})
                    )
                    st.dataframe(styled_df, use_container_width=True, hide_index=True)
                    csv_bytes = overlap_df.to_csv(index=False).encode("utf-8")
                    st.download_button(
                        label=f"Download CSV ({label})",
                        data=csv_bytes,
                        file_name=f"lastfm_overlap_{user1.strip()}_{user2.strip()}_{period}.csv",
                        mime="text/csv",
                    )
                else:
                    st.info("No shared artists for this timeframe.")

            st.divider()
else:
    st.info("Enter users and click 'Generate Venn Diagrams' to begin.")
