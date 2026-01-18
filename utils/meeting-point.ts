import type { Booking } from '@/app/services/booking-store';
import type { Ride } from '@/app/services/rides';
import type { LatLng } from '@/app/services/location';

export type MeetingPoint = {
  address: string;
  latLng: LatLng | null;
};

const isFiniteCoord = (value: number | undefined | null) =>
  typeof value === 'number' && Number.isFinite(value);

const sanitizeLatLng = (input?: LatLng | null): LatLng | null => {
  if (!input) return null;
  const lat = typeof input.lat === 'string' ? Number.parseFloat(input.lat) : input.lat;
  const lng = typeof input.lng === 'string' ? Number.parseFloat(input.lng) : input.lng;
  if (!isFiniteCoord(lat) || !isFiniteCoord(lng)) {
    console.warn('[MeetingPoint] invalid latLng', input);
    return null;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    console.warn('[MeetingPoint] latLng out of range', { lat, lng });
    return null;
  }
  return { lat, lng };
};

const getRideAddress = (ride?: Ride | null) =>
  ride?.meetingPointAddress ?? ride?.depart ?? '';
const getBookingAddress = (booking?: Booking | null) =>
  booking?.meetingPointAddress ?? booking?.meetingPoint ?? '';

export const resolveMeetingPoint = ({
  ride,
  booking,
}: {
  ride?: Ride | null;
  booking?: Booking | null;
}): MeetingPoint => {
  const bookingLatLng = sanitizeLatLng(booking?.meetingPointLatLng);
  if (bookingLatLng) {
    return {
      address: getBookingAddress(booking) || getRideAddress(ride),
      latLng: bookingLatLng,
    };
  }
  const rideLatLng = sanitizeLatLng(ride?.meetingPointLatLng);
  if (rideLatLng) {
    return {
      address: ride?.meetingPointAddress ?? '',
      latLng: rideLatLng,
    };
  }
  const fallbackAddress = getBookingAddress(booking) || getRideAddress(ride);
  return {
    address: fallbackAddress,
    latLng: null,
  };
};
