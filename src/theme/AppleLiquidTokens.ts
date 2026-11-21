// src/theme/AppleLiquidTokens.ts

export const APPLE_BAR_METRICS = {
  /** الارتفاع القياسي للشريط العائم في iOS */
  barHeight: 60,
  /** الهوامش الجانبية لإعطاء إحساس "الجزيرة العائمة" بدلاً من الامتداد الكامل */
  horizontalMargin: 26,
  /** المسافة من أسفل الشاشة (فوق شريط الـ Home Indicator) */
  bottomOffset: 22,
  /** الفراغ الموحد بين حدود الشريط والفقاعة الداخلية */
  innerInset: 4,
  /** ارتفاع الفقاعة المحسوب تلقائياً */
  bubbleHeight: 52, // barHeight - (innerInset * 2)
  iconSize: 21,
  labelSize: 10.5,
};

export const APPLE_LIQUID_COLORS = {
  dark: {
    barBg: 'rgba(28, 28, 30, 0.72)',
    barBorder: 'rgba(255, 255, 255, 0.14)',
    /** فقاعة زجاجية هادئة بدون قوس أبيض فاقع */
    bubbleBg: 'rgba(255, 255, 255, 0.15)',
    bubbleTopRim: 'rgba(255, 255, 255, 0.32)',
    bubbleBottomRim: 'rgba(255, 255, 255, 0.05)',
    activeTint: '#FFFFFF',
    inactiveTint: 'rgba(235, 235, 245, 0.48)',
  },
  light: {
    barBg: 'rgba(245, 245, 247, 0.78)',
    barBorder: 'rgba(255, 255, 255, 0.85)',
    /** عدسة ناعمة تسمح بمرور الضوء بدون تباين بلاستيكي */
    bubbleBg: 'rgba(255, 255, 255, 0.78)',
    bubbleTopRim: 'rgba(255, 255, 255, 0.98)',
    bubbleBottomRim: 'rgba(0, 0, 0, 0.04)',
    activeTint: '#000000',
    inactiveTint: 'rgba(60, 60, 67, 0.55)',
  },
};
