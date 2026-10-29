/**
 * Utilitas tanggal tanpa jam (YYYY-MM-DD). Semua tanggal disimpan sebagai
 * tengah malam UTC agar cocok dengan kolom `DATE` di database.
 */

export const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Tanggal hari ini menurut zona waktu tertentu, mis. `Asia/Jakarta`. */
export function todayDateOnly(timeZone: string): Date {
  // Locale en-CA menghasilkan format YYYY-MM-DD.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone }).format(
    new Date(),
  );
  return parseDateOnly(today);
}

/**
 * Jumlah hari kerja (Senin–Jumat, bukan hari libur) dari `start` sampai
 * `end`, inklusif. `holidays` berisi tanggal berformat YYYY-MM-DD.
 */
export function countWorkingDays(
  start: Date,
  end: Date,
  holidays: ReadonlySet<string> = new Set(),
): number {
  let count = 0;
  for (
    const day = new Date(start);
    day <= end;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    const weekday = day.getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;
    if (!isWeekend && !holidays.has(formatDateOnly(day))) count++;
  }
  return count;
}
