import {
  countWorkingDays,
  formatDateOnly,
  parseDateOnly,
  todayDateOnly,
} from './date.util';

describe('date.util', () => {
  describe('countWorkingDays', () => {
    const count = (start: string, end: string) =>
      countWorkingDays(parseDateOnly(start), parseDateOnly(end));

    it('menghitung satu hari kerja', () => {
      expect(count('2026-11-02', '2026-11-02')).toBe(1); // Senin
    });

    it('melewati Sabtu dan Minggu', () => {
      // Jumat 6 Nov → Senin 9 Nov = Jumat + Senin
      expect(count('2026-11-06', '2026-11-09')).toBe(2);
    });

    it('satu minggu penuh = 5 hari kerja', () => {
      expect(count('2026-11-02', '2026-11-08')).toBe(5);
    });

    it('akhir pekan saja = 0 hari', () => {
      expect(count('2026-11-07', '2026-11-08')).toBe(0);
    });

    it('tanggal akhir sebelum tanggal mulai = 0 hari', () => {
      expect(count('2026-11-09', '2026-11-02')).toBe(0);
    });
  });

  it('parse & format bolak-balik tanpa bergeser zona waktu', () => {
    expect(formatDateOnly(parseDateOnly('2026-12-31'))).toBe('2026-12-31');
  });

  it('todayDateOnly mengikuti zona waktu', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-29T20:00:00Z'));
    expect(formatDateOnly(todayDateOnly('UTC'))).toBe('2026-10-29');
    // 20:00 UTC = 03:00 WIB keesokan harinya
    expect(formatDateOnly(todayDateOnly('Asia/Jakarta'))).toBe('2026-10-30');
    jest.useRealTimers();
  });
});
