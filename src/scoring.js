// Errors are normalised by the axis span, so a score means the same thing on every chart.
// Score decays exponentially with mean absolute error. An average miss of 10% of the axis
// span scores ~46, 5% scores ~68, 2% scores ~86, and 1% scores ~93.
const DECAY = 0.13;

export function scoreGuess(actual, guess, domain) {
  const errors = actual.map((d) => guess.get(d.year) - d.value);
  const mae = errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length;
  const bias = errors.reduce((s, e) => s + e, 0) / errors.length;
  const span = domain[1] - domain[0];
  const score = Math.round(100 * Math.exp(-mae / (DECAY * span)));
  return { score, mae, bias };
}
