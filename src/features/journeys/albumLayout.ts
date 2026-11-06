export interface JustifiedAlbumItem<T> {
  entry: T;
  width: number;
}

export interface JustifiedAlbumRow<T> {
  height: number;
  items: JustifiedAlbumItem<T>[];
}

/**
 * Groups images in source order into horizontal, justified rows.
 * The final row is left at the target height rather than stretched.
 */
export function buildJustifiedRows<T extends { id: string }>(
  items: T[],
  aspectRatios: Record<string, number>,
  containerWidth: number,
  targetHeight = 190,
  gap = 12,
): JustifiedAlbumRow<T>[] {
  if (!items.length || containerWidth <= 0) return [];

  const rows: JustifiedAlbumRow<T>[] = [];
  let pending: T[] = [];
  let ratioTotal = 0;

  const ratioFor = (item: T) => {
    const ratio = aspectRatios[item.id];
    return Number.isFinite(ratio) && ratio > 0 ? ratio : 1.35;
  };

  const flush = (justify: boolean) => {
    if (!pending.length) return;
    const availableWidth = Math.max(0, containerWidth - gap * (pending.length - 1));
    const naturalHeight = availableWidth / ratioTotal;
    const height = justify
      ? Math.min(260, naturalHeight)
      : Math.min(targetHeight, naturalHeight);
    rows.push({
      height,
      items: pending.map((entry) => ({
        entry,
        width: ratioFor(entry) * height,
      })),
    });
    pending = [];
    ratioTotal = 0;
  };

  for (const item of items) {
    pending.push(item);
    ratioTotal += ratioFor(item);
    const availableWidth = Math.max(0, containerWidth - gap * (pending.length - 1));
    if (availableWidth / ratioTotal <= targetHeight) {
      flush(true);
    }
  }

  flush(false);
  return rows;
}
