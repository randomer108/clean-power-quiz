# Clean power: draw the line

A "you draw it" chart game about Britain's electricity. Each chart shows the start of a line. Players draw
the rest, the real line is revealed, and each guess is scored out of 100. The score bar keeps a running total.

There are three sections, each with its own accent colour:

- **Clean Power 2030:** the three DESNZ headline metrics.
- **The bigger picture:** longer histories of the renewables share, electricity demand, power station emissions and
  household energy bills.
- **What happens next?:** forecasts from NESO's Future Energy Scenarios 2025, Holistic Transition pathway.
  These cover demand, power emissions and electric cars.

## Setup

```sh
npm install
npm run dev      # local dev server
npm run build    # static site in dist/

# only when refreshing data
pip install -r requirements.txt
npm run data     # downloads the source workbooks and rewrites data/data.json
```

The site builds from the committed `data/data.json`, so building doesn't need Python or the source workbooks.
To update the data, point the URLs in `SOURCES` in `scripts/fetch_data.py` at the new editions, run
`npm run data`, and commit the changed `data/data.json`. Downloaded workbooks are cached in `data/raw/`,
which is gitignored.

## Code map

| File | What it does |
| --- | --- |
| `src/metrics.js` | Config for sections and charts: titles, questions, axis ranges, targets and reveal years |
| `src/main.js` | Builds the page from the config and keeps the score bar up to date |
| `src/game.js` | One chart: drawing, reveal, hover and per-chart score |
| `src/scoring.js` | Turns a guess into a score out of 100 |
| `src/style.css` | All styling. Colours are CSS variables at the top. |
| `scripts/fetch_data.py` | Extracts the series from the gov.uk and NESO spreadsheets |
