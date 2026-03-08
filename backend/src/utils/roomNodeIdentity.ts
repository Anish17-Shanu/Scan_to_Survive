export type RoomNodeInput = {
  room_number: string;
  floor: number | null;
  is_entry?: boolean;
  is_final?: boolean;
  is_trap?: boolean;
};

const FOUNDATIONAL_NODE_IDENTITIES = [
  "CPU Control Center",
  "Memory Cache Vault",
  "Compiler Chamber",
  "Operating System Kernel",
  "Router Command Hub",
  "Firewall Sentinel",
  "Data Structure Grid",
  "Network Switch Core"
] as const;

const ADVANCED_NODE_IDENTITIES = [
  "Cloud Compute Nexus",
  "AI Cognition Lab",
  "Distributed Node Matrix",
  "Encryption Vault",
  "Blockchain Ledger Core",
  "Neural Network Engine",
  "Quantum Processing Unit",
  "Core System Terminal"
] as const;

function digitsOnly(roomNumber: string): string {
  const digits = roomNumber.replace(/\D/g, "");
  return digits.length > 0 ? digits : roomNumber;
}

export function resolveNodeIdentity(room: RoomNodeInput): string {
  if (room.is_entry) return "Ingress Authentication Gateway";
  if (room.is_final) return "Core System Terminal";
  const token = digitsOnly(room.room_number);
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
  }
  const pool = (room.floor ?? 1) <= 1 ? FOUNDATIONAL_NODE_IDENTITIES : ADVANCED_NODE_IDENTITIES;
  const base = pool[hash % pool.length] ?? pool[0];
  return room.is_trap ? `${base} (Corrupted Node)` : base;
}

export function resolveNodeStatus(room: RoomNodeInput): string {
  if (room.is_entry) return "STABLE";
  if (room.is_final) return "CRITICAL";
  if (room.is_trap) return "COMPROMISED";
  return "UNDER RESTORATION";
}

export function resolveNodeStatusStory(room: RoomNodeInput): string {
  if (room.is_entry) return "Agents are connecting to the network. Mission handshake established.";
  if (room.is_final) return "NULL core defenses active. Final override authorization required.";
  if (room.is_trap) return "NULL has deployed malicious routines in this node. Purge required.";
  return "Solve the technical challenge to restore node integrity.";
}
