/** Fixed catalog: assigning tags to materials does not change the catalog. */
export const stockTags = [
  'Розхідник',
  'Фарба',
  'Фарба_чорна',
  'Фарба_біла',
  'Фарба_сіра',
  'Фарба_срібляста',
  'Фарба_червона',
  'Фарба_помаранчева',
  'Фарба_жовта',
  'Фарба_зелена',
  'Фарба_синя',
  'Фарба_блакитна',
  'Фарба_фіолетова',
  'Фарба_рожева',
  'Фарба_коричнева',
  'Фарба_бежева'
] as const;

export type StockTag = (typeof stockTags)[number];

interface StockTagColor {
  backgroundColor: string;
  color: string;
}

/** Fixed, theme-independent colors with readable text, including white and black paint. */
export const stockTagColors: Record<StockTag, StockTagColor> = {
  Розхідник: { backgroundColor: '#e2e8f0', color: '#334155' },
  Фарба: { backgroundColor: '#e0e7ff', color: '#3730a3' },
  Фарба_чорна: { backgroundColor: '#262626', color: '#ffffff' },
  Фарба_біла: { backgroundColor: '#ffffff', color: '#171717' },
  Фарба_сіра: { backgroundColor: '#e5e7eb', color: '#374151' },
  Фарба_срібляста: { backgroundColor: '#f1f5f9', color: '#475569' },
  Фарба_червона: { backgroundColor: '#fee2e2', color: '#991b1b' },
  Фарба_помаранчева: { backgroundColor: '#ffedd5', color: '#9a3412' },
  Фарба_жовта: { backgroundColor: '#fef9c3', color: '#854d0e' },
  Фарба_зелена: { backgroundColor: '#dcfce7', color: '#166534' },
  Фарба_синя: { backgroundColor: '#dbeafe', color: '#1e40af' },
  Фарба_блакитна: { backgroundColor: '#e0f2fe', color: '#075985' },
  Фарба_фіолетова: { backgroundColor: '#f3e8ff', color: '#6b21a8' },
  Фарба_рожева: { backgroundColor: '#fce7f3', color: '#9d174d' },
  Фарба_коричнева: { backgroundColor: '#eee1d5', color: '#653b22' },
  Фарба_бежева: { backgroundColor: '#f5eddd', color: '#6b5535' }
};
