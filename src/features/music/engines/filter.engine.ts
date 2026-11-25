export const FILTER_PILLS = [
  'All',
  'For You',
  'Trending',
  'Chill',
  'Discover',
] as const;

export type FilterPill = (typeof FILTER_PILLS)[number];

export class FilterEngine {
  public static isValidFilter(pill: string): pill is FilterPill {
    return FILTER_PILLS.includes(pill as FilterPill);
  }
}
