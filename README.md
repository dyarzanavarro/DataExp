# Zurich Data Playground

Interactive multi-dataset site for Zurich open data with a cleaner folder structure.

## Project Structure

- `index.html`: hub landing page
- `routes/`: subpages (`migration.html`, `dogs.html`, `voting.html`, `parolen.html`, `pedestrians.html`)
- `scripts/`: page logic (`migration.js`, `dogs.js`, `voting.js`, `parolen.js`, `pedestrians.js`)
- `styles/`: page styles (`hub.css`, `migration.css`, `dogs.css`, `voting.css`, `parolen.css`, `pedestrians.css`)
- `assets/csv/`: datasets

## Datasets

- `assets/csv/bev353od3530.csv`: migration into Zurich
- `assets/csv/kul100od1001.csv`: registered dogs in Zurich
- `assets/csv/stimmbeteiligung.csv`: voting participation progression
- `assets/csv/abstimmungsparolen.csv`: party slogans for municipal votes
- `assets/csv/hystreet_fussgaengerfrequenzen_seit2021.csv`: hourly footfall counts near Bahnhofstrasse

## Run

Because browsers often block `fetch()` from `file://`, run a local server from the project root.

### Option 1: Node

```powershell
npx serve .
```

### Option 2: Python

```powershell
py -m http.server 8000
```

Then open the shown URL and start at `index.html`.
If auto-loading fails on any page, use **Load CSV Manually**.
