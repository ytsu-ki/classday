import { describe, expect, it } from 'vitest';
import { quickParse } from '../src/domain/quickParse';

const TODAY = '2026-10-13'; // Tuesday

describe('capture parsing', () => {
  it('reads a trailing day and duration', () => {
    expect(quickParse('Essay draft fri 2h', TODAY)).toMatchObject({ title: 'Essay draft', due: '2026-10-16', minutes: 120 });
    expect(quickParse('Problem set 45 min tomorrow', TODAY)).toMatchObject({ title: 'Problem set', due: '2026-10-14', minutes: 45 });
    expect(quickParse('Read paper 1h30', TODAY)).toMatchObject({ title: 'Read paper', minutes: 90 });
  });

  it('reads dates and times with connector words', () => {
    expect(quickParse('Submit lab report by 11:59pm', TODAY)).toMatchObject({ title: 'Submit lab report', due: TODAY, dueTime: '23:59' });
    expect(quickParse('Call the bank tomorrow 5pm', TODAY)).toMatchObject({ title: 'Call the bank', due: '2026-10-14', dueTime: '17:00' });
    expect(quickParse('Pay rent next mon', TODAY)).toMatchObject({ title: 'Pay rent', due: '2026-10-19' });
    expect(quickParse('Group project due oct 30', TODAY)).toMatchObject({ title: 'Group project', due: '2026-10-30' });
    expect(quickParse('Return books 11/2', TODAY)).toMatchObject({ title: 'Return books', due: '2026-11-02' });
    expect(quickParse('Visit exhibition this weekend', TODAY)).toMatchObject({ title: 'Visit exhibition', due: '2026-10-18' });
    expect(quickParse('Apply for internship in 2 weeks', TODAY)).toMatchObject({ title: 'Apply for internship', due: '2026-10-27' });
    expect(quickParse('Pick up parcel tue', TODAY)).toMatchObject({ due: TODAY });
  });

  it('wraps past dates into next year', () => {
    expect(quickParse('Renew visa jan 5', TODAY).due).toBe('2027-01-05');
  });

  it('marks importance', () => {
    expect(quickParse('Scholarship form !', TODAY)).toMatchObject({ title: 'Scholarship form', important: true });
  });

  it('leaves ordinary titles alone', () => {
    for (const title of ['Read Sun Tzu', 'Chapter 4', 'CS 101 notes', 'Meet at 5', 'Wed', 'Buy 2 notebooks', 'Notes for Wed lecture']) {
      const parsed = quickParse(title, TODAY);
      expect(parsed.title).toBe(title.trim());
    }
    expect(quickParse('Lunch with Sam', TODAY).due).toBeUndefined();
  });

  it('lets the student undo a guess', () => {
    const parsed = quickParse('Essay fri 2h', TODAY, new Set(['due']));
    expect(parsed).toMatchObject({ title: 'Essay fri', minutes: 120 });
    expect(parsed.due).toBeUndefined();
    const keepDuration = quickParse('Essay fri 2h', TODAY, new Set(['duration']));
    expect(keepDuration).toMatchObject({ title: 'Essay 2h', due: '2026-10-16' });
  });

  it('reads importance and urgency as separate words', () => {
    expect(quickParse('Essay fri important', TODAY)).toMatchObject({ title: 'Essay', due: '2026-10-16', important: true });
    expect(quickParse('Call the bank urgent', TODAY)).toMatchObject({ title: 'Call the bank', urgent: true });
    expect(quickParse('Gym 3x/week', TODAY)).toMatchObject({ title: 'Gym 3x/week', tokens: [] });
  });
});
