import { describe, expect, it } from 'vitest';
import { colorFor } from './teamColors';

const CORAL = '#fb7185', AMBER = '#f59e0b', TEAL = '#2dd4bf', PURPLE = '#a78bfa';

describe('team colors', () => {
  it('presets', () => {
    expect(colorFor('Kenny + Lena')).toBe(CORAL);
    expect(colorFor('Tony + Karina')).toBe(AMBER);
    expect(colorFor('Megan + Jake')).toBe(TEAL);
    expect(colorFor('Will + Kathleen + Anna')).toBe(PURPLE);
  });

  it('a team keeps the color of the preset team it shares the most people with', () => {
    expect(colorFor('Megan + Jake + Colt')).toBe(TEAL);           // S51
    expect(colorFor('Will + Kathleen + Anna + Dan')).toBe(PURPLE); // S51
    expect(colorFor('Will')).toBe(PURPLE);                         // S46
    expect(colorFor('Lena & Kenny')).toBe(CORAL);                  // order, "&" and case don't matter
  });

  it('S51 teams all get different colors', () => {
    const s51 = ['Kenny + Lena', 'Tony + Karina', 'Megan + Jake + Colt', 'Will + Kathleen + Anna + Dan'].map(colorFor);
    expect(new Set(s51).size).toBe(4);
  });

  it('a brand-new team gets a spare color, the same one every time', () => {
    const c = colorFor('Sam + Alex');
    expect([CORAL, AMBER, TEAL, PURPLE]).not.toContain(c);
    expect(colorFor('Sam + Alex')).toBe(c);
  });
});
