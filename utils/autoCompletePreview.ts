import type { LatLng } from '@/app/services/location';
import { loadGoogleMapsApi } from '@/app/services/google-maps-loader';

const isBelgianLatLng = (lat: number, lng: number) =>
  lat >= 49.5 && lat <= 51.7 && lng >= 2.5 && lng <= 6.5;

export type ResolvedPreviewLocation = LatLng & {
  label?: string;
  placeId?: string;
};

export const resolveInputToLatLng = async (
  input: string
): Promise<ResolvedPreviewLocation | null> => {
  const trimmed = input.trim();
  if (trimmed.length < 3) {
    return null;
  }
  const google = await loadGoogleMapsApi({ libraries: ['places'] });
  if (!google?.maps?.places) {
    return null;
  }
  const service = new google.maps.places.AutocompleteService();
  const predictions = await new Promise<google.maps.places.AutocompletePrediction[]>(
    (resolve) => {
      service.getPlacePredictions(
        {
          input: trimmed,
          componentRestrictions: { country: 'be' },
        },
        (results, status) => {
          resolve(status === 'OK' && results ? results : []);
        }
      );
    }
  );
  const first = predictions[0];
  if (!first?.place_id) {
    return null;
  }
  const detailService = new google.maps.places.PlacesService(document.createElement('div'));
  const details = await new Promise<google.maps.places.PlaceResult | null>((resolve) => {
    detailService.getDetails(
      { placeId: first.place_id, fields: ['geometry'] },
      (result, status) => {
        resolve(status === 'OK' ? result : null);
      }
    );
  });
  const location = details?.geometry?.location;
  if (!location) {
    return null;
  }
  const lat = location.lat();
  const lng = location.lng();
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isBelgianLatLng(lat, lng)) {
    return null;
  }
  return {
    lat,
    lng,
    label: first.description,
    placeId: first.place_id,
  };
};
