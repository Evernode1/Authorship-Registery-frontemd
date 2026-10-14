import { addr, read, readNewest } from "./chain.js";

/** Attaches the registered work to each dispute: [{ d, work }]. */
export async function attachWorks(list) {
  const ids = [...new Set(list.map((d) => d.work_id))];
  const works = await Promise.all(ids.map((id) => read("get_work", [id])));
  const byId = Object.fromEntries(ids.map((id, i) => [id, works[i]]));
  return list.map((d) => ({ d, work: byId[d.work_id] }));
}

/** Newest-first works registered by an address (count capped by the caller). */
export async function loadWorksBy(address, count = 50) {
  const stats = await read("get_author_stats", [addr(address)]);
  const total = Number(stats?.works_registered || 0);
  if (!total) return [];
  return readNewest("list_works_by_author", total, count, [addr(address)]);
}

/** Every dispute opened against works registered by this address, newest first. */
export async function loadDisputesAgainst(address) {
  const works = await loadWorksBy(address, 50);
  const lists = await Promise.all(works.map((w) => read("list_disputes_for_work", [w.work_id])));
  const byWork = Object.fromEntries(works.map((w) => [w.work_id, w]));
  return lists
    .flat()
    .sort((a, b) => b.dispute_id - a.dispute_id)
    .map((d) => ({ d, work: byWork[d.work_id] }));
}
