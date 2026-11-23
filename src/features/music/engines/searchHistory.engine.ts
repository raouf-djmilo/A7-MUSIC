/**
 * 🔍 Search History Engine
 * Pure functions for managing search history with zero typing debounce pollution.
 */

/** الحد الأقصى لعدد عمليات البحث المحفوظة في السجل */
export const MAX_RECENT_SEARCHES = 8;

/** أقل عدد أحرف مسموح بحفظه لمنع حفظ الأحرف الناقصة مثل "m" */
export const MIN_QUERY_LENGTH = 2;

/**
 * دالة صافية (Pure Function) لإضافة كلمة بحث جديدة إلى السجل
 * - تتجاهل النصوص الفارغة أو الأقل من حرفين
 * - تزيل المسافات الزائدة (trim)
 * - تزيل التكرار غير الحساس لحالة الأحرف (case-insensitive deduplication)
 * - تضع الكلمة الجديدة في أول القائمة
 * - تقتطع القائمة عند الحد الأقصى
 */
export function addToSearchHistory(
  currentHistory: string[],
  rawQuery: string
): string[] {
  if (!rawQuery || typeof rawQuery !== 'string') {
    return currentHistory;
  }

  const cleaned = rawQuery.trim();

  // تجاهل النصوص الفارغة أو القصيرة جداً
  if (cleaned.length < MIN_QUERY_LENGTH) {
    return currentHistory;
  }

  // إزالة أي نسخة سابقة من نفس الكلمة (بدون حساسية لحالة الأحرف)
  const filtered = currentHistory.filter(
    (item) => item.toLowerCase() !== cleaned.toLowerCase()
  );

  // وضع البحث الجديد في البداية وتقليص القائمة للحد الأقصى
  return [cleaned, ...filtered].slice(0, MAX_RECENT_SEARCHES);
}

/**
 * دالة لتنظيف السجل المخزن القديم من أي أحرف ناقصة أو مدخلات تالفة
 */
export function cleanSearchHistory(rawList: unknown): string[] {
  if (!Array.isArray(rawList)) return [];

  const seen = new Set<string>();
  const sanitized: string[] = [];

  for (const item of rawList) {
    if (typeof item !== 'string') continue;
    const cleaned = item.trim();
    if (cleaned.length < MIN_QUERY_LENGTH) continue;

    const lower = cleaned.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      sanitized.push(cleaned);
    }

    if (sanitized.length >= MAX_RECENT_SEARCHES) break;
  }

  return sanitized;
}
