export function buildKeywordMapsSearchUrl(
  placeName: string,
  destinationHint?: string,
): string {
  const query = destinationHint
    ? `${placeName} ${destinationHint}`
    : placeName;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
