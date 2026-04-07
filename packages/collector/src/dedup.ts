import type { FeedItem } from "@updagent/shared";

export function dedup(newItems: FeedItem[], existingItems: FeedItem[]): FeedItem[] {
  const existingIds = new Set(existingItems.map((item) => item.id));
  return newItems.filter((item) => !existingIds.has(item.id));
}

export function dedupWithin(items: FeedItem[]): FeedItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
