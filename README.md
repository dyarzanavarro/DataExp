# Zurich Data Playground

Interactive multi-dataset site for Zurich open data.

## Pages

- `index.html`: hub landing page linking to each data experience
- `migration.html`: migration explorer based on `bev353od3530.csv`
- `dogs.html`: dog explorer based on `kul100od1001.csv`

## Features

- Shared exploratory style: interactive filters, KPIs, charts, and short narrative insights
- Migration page: annual evolution, Swiss vs foreign split, top neighborhoods, age profile
- Dogs page: annual dog count trend, top breeds, owner age profile, area-level exploration

## Run

Because browsers often block `fetch()` from `file://`, run a tiny local server in this folder.

### Option 1: Node

```powershell
npx serve .
```

### Option 2: Python

```powershell
py -m http.server 8000
```

Then open the shown local URL and start at `index.html`.
If any page cannot auto-load CSV, use its **Load CSV Manually** button.
