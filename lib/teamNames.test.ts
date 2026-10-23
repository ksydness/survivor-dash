import { describe, expect, it } from 'vitest';
import { shortName } from './teamNames';

describe('short team names', () => {
  it('nicknames', () => {
    expect(shortName('Will + Kathleen + Anna + Dan')).toBe('WAK’D');
    expect(shortName('Will + Kathleen + Anna')).toBe('WAK');
  });
  it('names that fit stay as they are', () => {
    expect(shortName('Kenny + Lena')).toBe('Kenny + Lena');
    expect(shortName('Megan + Jake + Colt')).toBe('Megan + Jake + Colt');
    expect(shortName('Will')).toBe('Will');
  });
  it('another long name becomes first name + how many others', () => {
    expect(shortName('Christopher + Alexandra + Sam')).toBe('Christopher +2');
  });
});
