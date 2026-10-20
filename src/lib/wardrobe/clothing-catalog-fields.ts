export type ClothingCategory =
  | 'outfit'
  | 'top'
  | 'bottom'
  | 'outerwear'
  | 'footwear'
  | 'accessory'
  | 'swimwear'
  | 'intimate'
  | 'hosiery'
  | 'formalwear'
  | 'dressy-accessory'
  | 'sleepwear'
  | 'underwear'
  | 'socks'
  | 'headwear'
  | 'traditional';

export const WARDROBE_CATEGORIES: ClothingCategory[] = [
  'outfit',
  'top',
  'bottom',
  'outerwear',
  'swimwear',
  'intimate',
  'formalwear',
  'sleepwear',
  'underwear',
  'traditional',
];

export const CLOTHING_CATALOG_FIELD_KEYS = [
  'wardrobeCatalog',
  'footwearCatalog',
  'accessoriesCatalog',
] as const;

export type ClothingCatalogFieldKey = (typeof CLOTHING_CATALOG_FIELD_KEYS)[number];

export function getClothingCatalogFieldCategories(
  key: ClothingCatalogFieldKey
): ClothingCategory[] {
  switch (key) {
    case 'wardrobeCatalog':
      return WARDROBE_CATEGORIES;
    case 'footwearCatalog':
      return ['footwear'];
    case 'accessoriesCatalog':
      return ['accessory', 'dressy-accessory', 'hosiery', 'socks', 'headwear'];
    default:
      return [];
  }
}

/** UI labels for wardrobe categories — keep out of clothing-catalog.ts so clients avoid the full batch import. */
export function categoryLabel(category: ClothingCategory): string {
  switch (category) {
    case 'outfit':
      return 'Full outfits';
    case 'top':
      return 'Tops';
    case 'bottom':
      return 'Bottoms';
    case 'outerwear':
      return 'Outerwear';
    case 'footwear':
      return 'Footwear';
    case 'accessory':
      return 'Accessories';
    case 'swimwear':
      return 'Swimwear';
    case 'intimate':
      return 'Intimates & loungewear';
    case 'hosiery':
      return 'Hosiery';
    case 'formalwear':
      return 'Formal & dressy';
    case 'dressy-accessory':
      return 'Dressy accessories';
    case 'sleepwear':
      return 'Sleepwear & robes';
    case 'underwear':
      return 'Underwear & base layers';
    case 'socks':
      return 'Socks & legwear';
    case 'headwear':
      return 'Headwear';
    case 'traditional':
      return 'Traditional & cultural';
    default:
      return category;
  }
}
