const QUALITY = { again: 0, hard: 3, good: 4, easy: 5 };

export function applyGrade(card, grade) {
  const q = QUALITY[grade];
  if (q === undefined) throw new Error(`Unknown grade: ${grade}`);

  let { ease, interval, repetitions } = card;

  if (q < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.round(interval * ease);

    ease = Math.max(1.3, ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + interval);

  return { ease, interval, repetitions, dueDate, lastReviewedAt: new Date() };
}
