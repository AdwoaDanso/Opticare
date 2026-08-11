function parseAcuity(value) {
  if (!value) return null;
  const parts = value.split('/');
  if (parts.length !== 2) return null;

  const numerator = Number(parts[0]);
  const denominator = Number(parts[1]);
  if (!numerator || !denominator) return null;

  return numerator / denominator;
}

function checkForDecline(exams) {
  if (exams.length < 2) return null;

  const latest = exams[0];
  const previous = exams[1];

  const latestRight = parseAcuity(latest.visual_acuity_right);
  const previousRight = parseAcuity(previous.visual_acuity_right);

  if (latestRight !== null && previousRight !== null && latestRight < previousRight) {
    return `Right eye declined from ${previous.visual_acuity_right} to ${latest.visual_acuity_right}`;
  }

  return null;
}

module.exports = { parseAcuity, checkForDecline };