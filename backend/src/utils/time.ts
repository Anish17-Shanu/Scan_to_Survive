export function elapsedSeconds(startTimeIso: string, endDate = new Date()): number {
  const start = new Date(startTimeIso).getTime();
  const end = endDate.getTime();
  return Math.max(0, Math.floor((end - start) / 1000));
}
