export const maskPlate = (value?: string | null): string => {
  const fallback = '2-H**-1**';
  if (!value) return fallback;
  const clean = value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  if (clean.length < 7) return fallback;
  const segmentA = clean.charAt(0) || '2';
  const segmentB = clean.slice(1, 4);
  const segmentC = clean.slice(4, 7);
  const maskSegment = (segment: string, fallbackChar: string) => {
    if (!segment) return `${fallbackChar}**`;
    return `${segment.charAt(0) || fallbackChar}**`;
  };
  return `${segmentA}-${maskSegment(segmentB, 'H')}-${maskSegment(segmentC, '1')}`;
};
