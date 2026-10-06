import dataset from '../data/data.json';
import { METRICS, SECTIONS } from './metrics.js';
import { createGame } from './game.js';

const sectionsEl = document.getElementById('sections');
const scorebarEl = document.getElementById('scorebar');
const totalEl = document.getElementById('total');
const scores = new Map();
const MAX = METRICS.length * 100;
const metricsIn = (section) => METRICS.filter((m) => m.section === section.id);

for (const section of SECTIONS) {
  const sectionEl = document.createElement('section');
  sectionEl.className = 'section';
  sectionEl.dataset.section = section.id;
  sectionEl.innerHTML = `
    <h2 class="section-title">${section.title}</h2>
    <p class="section-intro">${section.intro}</p>`;
  sectionsEl.append(sectionEl);

  for (const metric of metricsIn(section)) {
    const card = document.createElement('section');
    card.className = 'game';
    card.id = `game-${metric.key}`;
    sectionEl.append(card);

    createGame(card, metric, dataset.series[metric.key].data, (score) => {
      scores.set(metric.key, score);
      renderScores();
    });
  }
}

// Sticky bar: one slot per chart, grouped by section, plus the running total.
function renderScores() {
  const total = [...scores.values()].reduce((a, b) => a + b, 0);
  const groups = SECTIONS.map((section) => {
    const slots = metricsIn(section)
      .map((m) => {
        const s = scores.get(m.key);
        return `<a class="slot${s === undefined ? '' : ' done'}" href="#game-${m.key}">
          <span class="slot-label">${m.short}</span>
          <span class="slot-score">${s ?? '-'}</span>
        </a>`;
      })
      .join('');
    return `<div class="slot-group" data-section="${section.id}">${slots}</div>`;
  }).join('');

  scorebarEl.innerHTML = `
    ${groups}
    <div class="slot total">
      <span class="slot-label">Total</span>
      <span class="slot-score">${total}<span class="out-of">/${MAX}</span></span>
    </div>`;

  if (scores.size === METRICS.length) {
    totalEl.hidden = false;
    totalEl.innerHTML = `
      <p>Final score</p>
      <p class="total-score">${total}<span class="out-of">/${MAX}</span></p>
      <p>An average of ${Math.round(total / METRICS.length)} per chart</p>`;
  }
}

renderScores();
