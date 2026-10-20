import {
  searchCatalog,
  listCatalogClothing,
  listCatalogLocations,
} from '@/lib/search/catalog-index';
import {
  CLOTHING_CATALOG_FIELD_KEYS,
  getClothingCatalogFieldCategories,
  type ClothingCatalogFieldKey,
} from '@/lib/wardrobe/clothing-catalog-fields';
import { getClothingSelectOptions } from '@/lib/wardrobe/clothing-catalog';
import { apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function isClothingCatalogFieldKey(value: string): value is ClothingCatalogFieldKey {
  return (CLOTHING_CATALOG_FIELD_KEYS as readonly string[]).includes(value);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim() ?? '';
  const type = url.searchParams.get('type') ?? 'all';
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 200), 500);
  const ids = url.searchParams
    .get('ids')
    ?.split(',')
    .map(id => id.trim())
    .filter(Boolean);
  const categories = url.searchParams
    .get('categories')
    ?.split(',')
    .map(category => category.trim())
    .filter(Boolean);

  if (query) {
    return apiJson(searchCatalog(query));
  }

  if (type === 'clothing-options') {
    const field = url.searchParams.get('field')?.trim() ?? '';
    const genderRaw = url.searchParams.get('gender')?.trim() ?? 'any';
    const gender =
      genderRaw === 'women' || genderRaw === 'men' || genderRaw === 'any' ? genderRaw : 'any';

    if (!isClothingCatalogFieldKey(field)) {
      return apiJson({ error: 'Invalid clothing catalog field.' }, { status: 400 });
    }

    const categoriesForField = getClothingCatalogFieldCategories(field);
    const options = getClothingSelectOptions(categoriesForField, { gender });
    return apiJson(
      { options },
      {
        headers: {
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        },
      }
    );
  }

  if (type === 'clothing') {
    return apiJson(
      {
        clothing: listCatalogClothing({ limit, ids, categories }),
      },
      {
        headers: {
          'Cache-Control': ids?.length
            ? 'private, max-age=300'
            : 'public, max-age=3600, stale-while-revalidate=86400',
        },
      }
    );
  }

  if (type === 'locations') {
    return apiJson(
      { locations: listCatalogLocations({ limit }) },
      {
        headers: {
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        },
      }
    );
  }

  return apiJson(
    {
      clothing: listCatalogClothing({ limit: Math.min(limit, 100) }),
      locations: listCatalogLocations({ limit: Math.min(limit, 100) }),
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=600, stale-while-revalidate=3600',
      },
    }
  );
}

export async function POST() {
  return apiMethodNotAllowed(['GET'], '/api/catalog');
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
