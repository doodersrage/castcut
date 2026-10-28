'use client';

import { useEffect, useState } from 'react';
import { loadLocations, subscribeLocations, type LocationRecord } from '@/lib/location/records';

/** The location records, kept current (M8). Empty on the server render; read after mount. */
export function useLocations(): LocationRecord[] {
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  useEffect(() => {
    const read = () => setLocations(loadLocations());
    read();
    return subscribeLocations(read);
  }, []);
  return locations;
}
