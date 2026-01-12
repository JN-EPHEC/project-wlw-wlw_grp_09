declare global {
  interface Window {
    google?: any;
    __campusRideGoogleMapsLoader?: Promise<any>;
  }
}

export type GoogleMapsApi = typeof google;

const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? 'AIzaSyCU9joaWe-_aSq4RMbqbLsrVi0pkC5iu8c';

export const loadGoogleMapsApi = (): Promise<GoogleMapsApi> => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('window unavailable'));
  }
  if (window.google && window.google.maps) {
    return Promise.resolve(window.google);
  }
  if (window.__campusRideGoogleMapsLoader) {
    return window.__campusRideGoogleMapsLoader;
  }
  window.__campusRideGoogleMapsLoader = new Promise<GoogleMapsApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google!);
    script.onerror = () => reject(new Error('Google Maps JS failed to load.'));
    document.head.appendChild(script);
  });
  return window.__campusRideGoogleMapsLoader;
};

export {};
