import { promises as fs } from "node:fs";
import path from "node:path";
import { getAllPlayers, type Player } from "./sleeper";

const TTL_MS = 24 * 60 * 60 * 1000;
const TMP_FILE = path.join("/tmp", "wlr-players.json");

type Cache = { fetchedAt: number; players: Record<string, Player> };
let memCache: Cache | null = null;

async function readDiskCache(): Promise<Cache | null> {
  try {
    const raw = await fs.readFile(TMP_FILE, "utf8");
    const parsed = JSON.parse(raw) as Cache;
    if (Date.now() - parsed.fetchedAt < TTL_MS) return parsed;
    return null;
  } catch {
    return null;
  }
}

async function writeDiskCache(c: Cache) {
  try {
    await fs.writeFile(TMP_FILE, JSON.stringify(c));
  } catch {
    // /tmp may be unavailable in some runtimes — best effort only
  }
}

export async function getPlayersDict(): Promise<Record<string, Player>> {
  if (memCache && Date.now() - memCache.fetchedAt < TTL_MS) {
    return memCache.players;
  }
  const fromDisk = await readDiskCache();
  if (fromDisk) {
    memCache = fromDisk;
    return fromDisk.players;
  }
  const players = await getAllPlayers();
  const cache: Cache = { fetchedAt: Date.now(), players };
  memCache = cache;
  await writeDiskCache(cache);
  return players;
}

export function playerName(p: Player | undefined, fallbackId: string): string {
  if (!p) return fallbackId;
  if (p.full_name) return p.full_name;
  const fn = p.first_name ?? "";
  const ln = p.last_name ?? "";
  const joined = `${fn} ${ln}`.trim();
  return joined || fallbackId;
}
