import { OPERATIONS } from '../src/reference/operations';

describe('OPERATIONS', () => {
  it('tem 22 operations e inclui Random e Poll', () => {
    expect(OPERATIONS).toHaveLength(22);
    expect(OPERATIONS).toContain('Random');
    expect(OPERATIONS).toContain('Poll');
    expect(OPERATIONS).toContain('Dread Palace');
  });
});
