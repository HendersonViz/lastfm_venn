# AGENTS.md

## Purpose
This repository contains a Streamlit app that compares two Last.fm usernames and visualizes overlapping top artists with Venn diagrams across selected timeframes.

## Stack
- Python 3
- Streamlit
- requests
- matplotlib
- matplotlib-venn
- pandas

## Quick Start
1. Create a virtual environment and activate it.
2. Install dependencies:
   - `pip install -r requirements.txt`
3. Provide a Last.fm API key:
   - set env var: `export LASTFM_API_KEY="your_key"`
   - or enter key in the sidebar at runtime
4. Run app:
   - `streamlit run app.py`

## Project Map
- `app.py`
  - Streamlit UI
  - input handling (users, periods, API key)
  - display metrics, charts, overlap table, CSV export
- `lastfm_venn/client.py`
  - Last.fm API client (`user.gettopartists`)
  - pagination, response parsing, error normalization
- `lastfm_venn/analysis.py`
  - overlap computation and shared-artist ranking
- `lastfm_venn/visualization.py`
  - styled 2-set Venn chart rendering

## Development Guidelines
- Keep logic modular:
  - API/network code in `client.py`
  - data transforms in `analysis.py`
  - plotting in `visualization.py`
  - UI orchestration in `app.py`
- Preserve existing timeframe mapping unless intentionally changing product behavior.
- Handle Last.fm/API failures with user-facing errors, not crashes.
- Prefer explicit types and simple pure functions for analysis logic.

## Validation
Run at least:
- `python3 -m compileall app.py lastfm_venn`

Manual smoke test:
1. Launch app.
2. Enter API key + two valid usernames.
3. Select multiple periods.
4. Confirm Venn chart, metrics, table, and CSV download render per period.

## Notes
- No formal automated test suite is set up yet.
- Use `python3` explicitly in this environment.
