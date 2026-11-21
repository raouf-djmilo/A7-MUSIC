// src/theme/AppleLiquidTokens.ts

export const APPLE_BAR_METRICS = {
  /** الارتفاع القياسي للشريط العائم في iOS */
  barHeight: 62,
  /** الهوامش الجانبية لإعطاء إحساس الجزيرة الزجاجية العائمة */
  horizontalMargin: 24,
  /** المسافة من أسفل الشاشة (فوق شريط مؤشر الصفحة الرئيسية) */
  bottomOffset: 22,
  /** الفراغ الموحد الدقيق بين حدود الشريط والفقاعة الزجاجية */
  innerInset: 3,
  /** ارتفاع الفقاعة المحسوب بدقة هندسية */
  bubbleHeight: 56, // barHeight - (innerInset * 2)
  iconSize: 22,
  labelSize: 11,
};

export const APPLE_LIQUID_COLORS = {
  dark: {
    /** شريط زجاجي سبجي عميق بنفاذية ضوئية متدرجة */
    barBg: 'rgba(14, 14, 18, 0.82)',
    barBorder: 'rgba(255, 255, 255, 0.12)',
    barBorderTop: 'rgba(255, 255, 255, 0.25)',

    /** 🔮 عدسة Liquid Glass الكريستالية ثلاثية الأبعاد (مطابقة تماماً للصورة المرجعية) */
    bubbleBg: 'rgba(255, 255, 255, 0.08)',
    bubbleTopRim: 'rgba(255, 255, 255, 0.95)',
    bubbleSideRim: 'rgba(255, 255, 255, 0.45)',
    bubbleBottomRim: 'rgba(255, 255, 255, 0.10)',
    bubbleInnerHighlight: 'rgba(255, 255, 255, 0.38)',

    activeTint: '#FFFFFF',
    inactiveTint: 'rgba(255, 255, 255, 0.40)',
  },
  light: {
    barBg: 'rgba(246, 246, 248, 0.85)',
    barBorder: 'rgba(0, 0, 0, 0.08)',
    barBorderTop: 'rgba(255, 255, 255, 0.95)',

    bubbleBg: 'rgba(255, 255, 255, 0.82)',
    bubbleTopRim: 'rgba(255, 255, 255, 1.0)',
    bubbleSideRim: 'rgba(255, 255, 255, 0.70)',
    bubbleBottomRim: 'rgba(0, 0, 0, 0.08)',
    bubbleInnerHighlight: 'rgba(255, 255, 255, 0.65)',

    activeTint: '#000000',
    inactiveTint: 'rgba(60, 60, 67, 0.50)',
  },
};
