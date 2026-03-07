export type AnchorRoom = {
  room_number: string;
  floor: number | null;
  is_entry?: boolean;
  is_trap?: boolean;
  is_final?: boolean;
};

const FINAL_KEY_SEGMENTS = ["NEXUS", "AMIPHORIA"] as const;
const FINAL_KEY_PREFIX = "FINAL-KEY";
const RAPID_FIRE_QR_SUFFIX = "RAPID-FIRE-QR";

function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function roomDigits(roomNumber: string): number {
  const digits = roomNumber.replace(/\D/g, "");
  const parsed = Number.parseInt(digits, 10);
  return Number.isNaN(parsed) ? -1 : parsed;
}

function areAdjacent(a: AnchorRoom, b: AnchorRoom): boolean {
  if (a.floor !== b.floor) return false;
  const da = roomDigits(a.room_number);
  const db = roomDigits(b.room_number);
  if (da < 0 || db < 0) return false;
  return Math.abs(da - db) <= 1;
}

function pickBySeed(
  seed: string,
  candidates: AnchorRoom[],
  usedIndexes: Set<number>,
  pickedRooms: AnchorRoom[]
): AnchorRoom | null {
  if (candidates.length === 0) return null;
  const base = stableHash(seed) % candidates.length;
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < candidates.length; i += 1) {
      const idx = (base + i) % candidates.length;
      if (usedIndexes.has(idx)) continue;
      const candidate = candidates[idx];
      const adjacentToAny = pickedRooms.some((picked) => areAdjacent(candidate, picked));
      if (pass === 0 && adjacentToAny) continue;
      usedIndexes.add(idx);
      return candidate;
    }
  }
  return null;
}

export function buildFinalKeyCodes(eventId: string) {
  return {
    nexus: `${eventId}-${FINAL_KEY_PREFIX}-${FINAL_KEY_SEGMENTS[0]}`,
    amiphoria: `${eventId}-${FINAL_KEY_PREFIX}-${FINAL_KEY_SEGMENTS[1]}`,
    rapidQr: `${eventId}-${RAPID_FIRE_QR_SUFFIX}`,
    gateReady: `${eventId}-${FINAL_KEY_PREFIX}-READY`
  };
}

export function pickFinalKeyAnchors(eventId: string, rooms: AnchorRoom[]) {
  const preferred = rooms
    .filter((room) => !room.is_entry && !room.is_trap && !room.is_final)
    .sort((a, b) => (a.floor ?? 0) - (b.floor ?? 0) || a.room_number.localeCompare(b.room_number));
  const fallback = rooms
    .filter((room) => !room.is_entry && !room.is_trap)
    .sort((a, b) => (a.floor ?? 0) - (b.floor ?? 0) || a.room_number.localeCompare(b.room_number));
  const candidates = preferred.length >= 3 ? preferred : fallback;
  if (candidates.length === 0) {
    return { nexus: null, amiphoria: null, rapidGate: null };
  }

  const used = new Set<number>();
  const picked: AnchorRoom[] = [];
  const nexus = pickBySeed(`${eventId}:NEXUS`, candidates, used, picked);
  if (nexus) picked.push(nexus);
  const amiphoria = pickBySeed(`${eventId}:AMIPHORIA`, candidates, used, picked);
  if (amiphoria) picked.push(amiphoria);
  const rapidGate = pickBySeed(`${eventId}:RAPID`, candidates, used, picked);

  return {
    nexus: nexus ? { room_number: nexus.room_number, floor: nexus.floor } : null,
    amiphoria: amiphoria ? { room_number: amiphoria.room_number, floor: amiphoria.floor } : null,
    rapidGate: rapidGate ? { room_number: rapidGate.room_number, floor: rapidGate.floor } : null
  };
}
