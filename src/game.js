import { select, scaleLinear, axisBottom, axisLeft, line, area, format, range } from 'd3';
import { scoreGuess } from './scoring.js';

// Chart margins, in viewBox units.
const M = { top: 20, right: 64, bottom: 32, left: 52 };

// The drawn line is stored on a fine x-grid (samples per year) so it follows the pointer freehand.
const STEPS = 20;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Linear interpolation along points sorted by year. Returns undefined past the last point.
function valueAt(points, year) {
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1];
    const b = points[k];
    if (b.year >= year) return a.value + ((year - a.year) / (b.year - a.year)) * (b.value - a.value);
  }
}

// `short` is for axis ticks and line labels; `long` is for tooltips, tables and score text.
function makeFormatters({ prefix = '', unit = '', unitLong, dp = 1 }) {
  const num = (v, places) => format(`,.${places}f`)(v);
  return {
    num,
    short: (v) => `${prefix}${num(v, 0)}${unit}`,
    long: (v) => `${prefix}${num(v, dp)}${unitLong ? ` ${unitLong}` : unit}`,
  };
}

function describeBias(mae, bias) {
  if (Math.abs(bias) < mae * 0.5) return 'You were too high in some years and too low in others.';
  return bias > 0 ? 'You mostly guessed too high.' : 'You mostly guessed too low.';
}

export function createGame(card, metric, series, onScore) {
  const { revealYear } = metric;
  const known = series.filter((d) => d.year <= revealYear);
  const hidden = series.filter((d) => d.year > revealYear);
  const anchor = known[known.length - 1];
  const years = series.map((d) => d.year);
  const lastYear = years[years.length - 1];
  const fmt = makeFormatters(metric);

  // ---- State --------------------------------------------------------------------------------

  // samples[i] is the drawn value at anchor.year + i / STEPS. Index 0 is pinned to the anchor.
  const N = (lastYear - anchor.year) * STEPS;
  const samples = new Array(N + 1);
  samples[0] = anchor.value;
  const sampleYear = (i) => anchor.year + i / STEPS;

  let revealed = false;
  let guess; // Map of year -> guessed value, filled in on reveal

  // Drawn points in x order. Unfilled grid cells are bridged by the line between their neighbours.
  const drawnPoints = () =>
    samples.flatMap((v, i) => (v === undefined ? [] : [{ year: sampleYear(i), value: v }]));

  // The line must reach the final year, and every year needs some drawing between it and the
  // previous year. This rules out a single tap at the far end.
  const hasSampleIn = (from, to) => samples.slice(from, to + 1).some((v) => v !== undefined);
  const isComplete = () =>
    samples[N] !== undefined &&
    hidden.every((d) => {
      const end = (d.year - anchor.year) * STEPS;
      return hasSampleIn(end - STEPS + 1, end);
    });

  // ---- Markup -------------------------------------------------------------------------------

  card.innerHTML = `
    <h2>${metric.title}</h2>
    <p class="question">${metric.question}</p>
    <div class="chart-wrap">
      <svg role="img" aria-label="${metric.title}, ${years[0]} to ${lastYear}"></svg>
      <div class="tooltip" hidden></div>
    </div>
    <div class="controls">
      <span class="legend">
        <span class="key key-actual"></span>Actual
        <span class="key key-guess"></span>Your guess
      </span>
      <button type="button" disabled>Draw your line first</button>
    </div>
    <div class="result" hidden></div>`;

  const button = card.querySelector('button');
  const resultEl = card.querySelector('.result');
  const tooltip = card.querySelector('.tooltip');

  // The viewBox matches the container's pixel width, so chart text stays at its CSS size on
  // phones instead of shrinking with the whole SVG.
  const W = clamp(card.querySelector('.chart-wrap').clientWidth, 300, 640);
  const H = Math.max(280, Math.round(W * 0.53));
  const svg = select(card).select('svg').attr('viewBox', `0 0 ${W} ${H}`);

  const x = scaleLinear().domain([years[0], lastYear]).range([M.left, W - M.right]);
  const y = scaleLinear().domain(metric.domain).range([H - M.bottom, M.top]).clamp(true);
  const lineGen = line()
    .x((d) => x(d.year))
    .y((d) => y(d.value));

  // ---- Static chart -------------------------------------------------------------------------
  // SVG paints in document order, so append order sets the layering.

  svg
    .append('g')
    .attr('class', 'grid')
    .attr('transform', `translate(${M.left},0)`)
    .call(axisLeft(y).ticks(5).tickSize(-(W - M.left - M.right)).tickFormat(fmt.short))
    .call((g) => g.select('.domain').remove());
  svg
    .append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${H - M.bottom})`)
    .call(
      axisBottom(x)
        // Label every year on short series; let D3 thin them out on long ones.
        .tickValues(years.length <= 12 ? years : x.ticks(Math.floor(W / 70)).filter(Number.isInteger))
        .tickFormat(format('d'))
        .tickSizeOuter(0),
    );

  const drawZone = svg.append('g').attr('class', 'draw-zone');
  drawZone
    .append('rect')
    .attr('x', x(revealYear))
    .attr('y', M.top)
    .attr('width', x(lastYear) - x(revealYear))
    .attr('height', H - M.top - M.bottom);
  const hint = drawZone
    .append('text')
    .attr('x', (x(revealYear) + x(lastYear)) / 2)
    .attr('y', M.top + 28)
    .attr('text-anchor', 'middle')
    .text('Draw your guess here');

  if (metric.target) {
    const ty = y(metric.target.value);
    svg.append('line').attr('class', 'target').attr('x1', M.left).attr('x2', W - M.right).attr('y1', ty).attr('y2', ty);
    svg.append('text').attr('class', 'target-label').attr('x', M.left + 6).attr('y', ty - 6).text(metric.target.label);
  }

  const gapPath = svg.append('path').attr('class', 'gap');
  svg.append('path').attr('class', 'line actual').attr('d', lineGen(known));
  const actualHidden = svg.append('path').attr('class', 'line actual');
  svg.append('circle').attr('class', 'dot actual').attr('cx', x(anchor.year)).attr('cy', y(anchor.value)).attr('r', 4);
  svg
    .append('text')
    .attr('class', 'value-label')
    .attr('x', x(anchor.year) + 8)
    .attr('y', y(anchor.value) - 10)
    .text(fmt.short(anchor.value));

  const guessPath = svg.append('path').attr('class', 'line guess');
  const guessDots = svg.append('g');
  const endLabels = svg.append('g');
  const crosshair = svg
    .append('line')
    .attr('class', 'crosshair')
    .attr('y1', M.top)
    .attr('y2', H - M.bottom)
    .attr('visibility', 'hidden');

  // Transparent overlay on top receives all pointer input: drawing before reveal, hover after.
  const overlay = svg
    .append('rect')
    .attr('class', 'overlay')
    .attr('x', M.left)
    .attr('y', M.top)
    .attr('width', W - M.left - M.right)
    .attr('height', H - M.top - M.bottom);

  // ---- Drawing ------------------------------------------------------------------------------

  // Convert a pointer event to data space, accounting for the SVG's CSS scaling.
  function toData(evt) {
    const node = svg.node();
    const pt = new DOMPoint(evt.clientX, evt.clientY).matrixTransform(node.getScreenCTM().inverse());
    return { year: x.invert(pt.x), value: y.invert(pt.y) };
  }

  let last = null; // previous pointer sample during a stroke

  // Fill every grid cell between the previous and current pointer position by linear
  // interpolation, so a fast swipe doesn't leave gaps. Moving back left redraws over old samples.
  function paint(evt) {
    const pos = toData(evt);
    const i = clamp(Math.round((pos.year - anchor.year) * STEPS), 1, N);
    const value = clamp(pos.value, ...metric.domain);
    if (last) {
      const step = Math.sign(i - last.i);
      for (let j = last.i + step; j !== i; j += step) {
        samples[j] = last.value + ((j - last.i) / (i - last.i)) * (value - last.value);
      }
    }
    samples[i] = value;
    last = { i, value };

    const pts = drawnPoints();
    guessPath.attr('d', pts.length > 1 ? lineGen(pts) : null);
    hint.attr('visibility', 'hidden');
    const complete = isComplete();
    button.disabled = !complete;
    button.textContent = complete ? 'Reveal' : `Keep drawing to ${lastYear}`;
  }

  overlay.on('pointerdown', (evt) => {
    if (revealed) return;
    evt.preventDefault();
    overlay.node().setPointerCapture(evt.pointerId);
    last = null;
    paint(evt);
  });
  overlay.on('pointermove', (evt) => {
    if (revealed) hover(evt);
    else if (overlay.node().hasPointerCapture(evt.pointerId)) paint(evt);
  });
  overlay.on('pointerup pointercancel', () => {
    last = null;
  });

  // ---- Hover (after reveal) -----------------------------------------------------------------

  function hover(evt) {
    const yr = clamp(Math.round(toData(evt).year), years[0], lastYear);
    const d = series.find((s) => s.year === yr);
    crosshair.attr('x1', x(yr)).attr('x2', x(yr)).attr('visibility', 'visible');
    const yours = guess.has(yr)
      ? `<div><span class="key key-guess"></span>Your guess: <b>${fmt.long(guess.get(yr))}</b></div>`
      : '';
    tooltip.innerHTML = `<div class="tt-year">${yr}</div>
      <div><span class="key key-actual"></span>Actual: <b>${fmt.long(d.value)}</b></div>${yours}`;
    tooltip.hidden = false;
    const leftPct = (x(yr) / W) * 100;
    tooltip.style.left = `${leftPct}%`;
    tooltip.classList.toggle('flip', leftPct > 60);
  }

  overlay.on('pointerleave', () => {
    crosshair.attr('visibility', 'hidden');
    tooltip.hidden = true;
  });

  // ---- Reveal -------------------------------------------------------------------------------

  button.addEventListener('click', () => {
    revealed = true;
    button.hidden = true;
    overlay.classed('revealed', true);

    const full = [anchor, ...hidden];
    const drawn = drawnPoints();
    guess = new Map(hidden.map((d) => [d.year, valueAt(drawn, d.year)]));

    // Shade between the freehand guess and the actual line, sampled on the drawing grid.
    gapPath
      .datum(range(N + 1).map(sampleYear))
      .attr(
        'd',
        area()
          .x((yr) => x(yr))
          .y0((yr) => y(valueAt(drawn, yr)))
          .y1((yr) => y(valueAt(full, yr))),
      );

    guessDots
      .selectAll('circle')
      .data(hidden)
      .join('circle')
      .attr('class', 'dot guess')
      .attr('r', 3)
      .attr('cx', (d) => x(d.year))
      .attr('cy', (d) => y(guess.get(d.year)));

    // Animate the real line drawing itself left to right.
    actualHidden.attr('d', lineGen(full));
    const len = actualHidden.node().getTotalLength();
    actualHidden
      .attr('stroke-dasharray', `${len} ${len}`)
      .attr('stroke-dashoffset', len)
      .transition()
      .duration(1200)
      .attr('stroke-dashoffset', 0)
      .on('end', () => actualHidden.attr('stroke-dasharray', null));

    // End labels for both lines, pushed apart if they would overlap.
    const end = hidden[hidden.length - 1];
    let ya = y(end.value);
    let yg = y(guess.get(end.year));
    if (Math.abs(ya - yg) < 16) {
      const mid = (ya + yg) / 2;
      const sign = ya <= yg ? -1 : 1;
      ya = mid + sign * 8;
      yg = mid - sign * 8;
    }
    endLabels
      .selectAll('text')
      .data([
        { y: ya, text: fmt.short(end.value), cls: 'value-label' },
        { y: yg, text: fmt.short(guess.get(end.year)), cls: 'value-label muted' },
      ])
      .join('text')
      .attr('class', (d) => d.cls)
      .attr('x', x(lastYear) + 8)
      .attr('y', (d) => d.y)
      .attr('dy', '0.35em')
      .text((d) => d.text);

    const { score, mae, bias } = scoreGuess(hidden, guess, metric.domain);
    const miss = metric.unit === '%' ? `${fmt.num(mae, 1)} percentage points` : fmt.long(mae);
    const rows = series
      .map((d) => `<tr><td>${d.year}</td><td>${fmt.long(d.value)}</td><td>${guess.has(d.year) ? fmt.long(guess.get(d.year)) : '–'}</td></tr>`)
      .join('');
    resultEl.hidden = false;
    resultEl.innerHTML = `
      <p class="score">${score}<span class="out-of">/100</span></p>
      <p>Average miss: <b>${miss}</b>. ${describeBias(mae, bias)}</p>
      <details>
        <summary>Show the data</summary>
        <table>
          <thead><tr><th>Year</th><th>Actual</th><th>Your guess</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </details>`;
    onScore(score);
  });
}
