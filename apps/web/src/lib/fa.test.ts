import { describe, expect, it } from 'vitest';
import { faDigits, monthLength, toGregorian, toJalali, toLatin } from './fa';

describe('Persian helpers', () => {
  it('converts digits both ways', () => {
    expect(faDigits('0912-123')).toBe('۰۹۱۲-۱۲۳');
    expect(toLatin('۰۹۱۲')).toBe('0912');
  });
  it('converts Jalali <-> Gregorian', () => {
    expect(toJalali(2026, 3, 21)).toEqual({ jy: 1405, jm: 1, jd: 1 });
    expect(toGregorian(1405, 8, 12)).toEqual({ gy: 2026, gm: 11, gd: 3 });
    expect(toJalali(2024, 3, 20)).toEqual({ jy: 1403, jm: 1, jd: 1 });
  });
  it('knows Esfand length in leap years', () => {
    expect(monthLength(1403, 12)).toBe(30);
    expect(monthLength(1404, 12)).toBe(29);
  });
});
