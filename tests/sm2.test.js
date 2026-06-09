import { applyGrade } from '../services/sm2.js';

const baseCard = { ease: 2.5, interval: 0, repetitions: 0 };

describe('SM-2 applyGrade', () => {
  it('again resets repetitions and sets interval=1', () => {
    const result = applyGrade({ ...baseCard, repetitions: 3, interval: 10 }, 'again');
    expect(result.repetitions).toBe(0);
    expect(result.interval).toBe(1);
  });

  it('hard on new card: repetitions=1, interval=1', () => {
    const result = applyGrade(baseCard, 'hard');
    expect(result.repetitions).toBe(1);
    expect(result.interval).toBe(1);
  });

  it('good on new card: repetitions=1, interval=1', () => {
    const result = applyGrade(baseCard, 'good');
    expect(result.repetitions).toBe(1);
    expect(result.interval).toBe(1);
  });

  it('second good: repetitions=2, interval=6', () => {
    const after1 = applyGrade(baseCard, 'good');
    const after2 = applyGrade({ ...baseCard, ...after1 }, 'good');
    expect(after2.repetitions).toBe(2);
    expect(after2.interval).toBe(6);
  });

  it('third good: interval = round(6 * ease)', () => {
    const after1 = applyGrade(baseCard, 'good');
    const after2 = applyGrade(
      { ease: after1.ease, interval: after1.interval, repetitions: after1.repetitions },
      'good',
    );
    const after3 = applyGrade(
      { ease: after2.ease, interval: after2.interval, repetitions: after2.repetitions },
      'good',
    );
    expect(after3.interval).toBe(Math.round(6 * after2.ease));
  });

  it('easy increases ease factor', () => {
    const result = applyGrade(baseCard, 'easy');
    expect(result.ease).toBeGreaterThan(2.5);
  });

  it('hard decreases ease factor but stays >= 1.3', () => {
    let card = { ...baseCard };
    for (let i = 0; i < 20; i++) card = { ...card, ...applyGrade(card, 'hard') };
    expect(card.ease).toBeGreaterThanOrEqual(1.3);
  });

  it('sets dueDate in the future', () => {
    const result = applyGrade(baseCard, 'good');
    expect(result.dueDate.getTime()).toBeGreaterThan(Date.now());
  });

  it('throws on unknown grade', () => {
    expect(() => applyGrade(baseCard, 'unknown')).toThrow();
  });
});
