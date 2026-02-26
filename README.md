# Last.fm Artist Overlap Explorer

A Streamlit app that compares two Last.fm usernames and generates Venn diagrams of overlapping artists across multiple timeframes.

## Features

- Compare two Last.fm users
- Select one or more periods (`7day`, `1month`, `3month`, `6month`, `12month`, `overall`)
- Styled Venn diagram for each selected timeframe
- Ranked table of shared artists (match score + balance-aware)
- CSV export per timeframe

## Setup

1. Create and activate a virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Create a Last.fm API key: https://www.last.fm/api/account/create
4. Set your API key as an environment variable:

```bash
export LASTFM_API_KEY="your_key_here"
```

## Run

```bash
streamlit run app.py
```

Then open the local URL shown by Streamlit.

## Project Structure

- `app.py`: Streamlit UI and orchestration
- `lastfm_venn/client.py`: Last.fm API client
- `lastfm_venn/analysis.py`: overlap computation logic
- `lastfm_venn/visualization.py`: Venn diagram styling
