import { arrayMove } from '@dnd-kit/sortable';

function containerKey(folderId) {
  return folderId ?? null;
}

function sameId(a, b) {
  return String(a) === String(b);
}

function itemsInContainer(links, folderId) {
  const key = containerKey(folderId);
  return links
    .filter((l) => l.visible === 1 && containerKey(l.folder_id) === key)
  .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Riordina due card nello stesso contenitore (root o cartella), folder_id invariato.
 * @returns {object[]|null} nuovo array links o null se nessun cambiamento
 */
export function reorderLinksInContainer(links, activeId, overId, containerId) {
  const active = links.find((l) => sameId(l.id, activeId));
  const over = links.find((l) => sameId(l.id, overId));
  if (!active || !over) return null;

  const activeContainer = containerKey(active.folder_id);
  const overContainer = containerKey(over.folder_id);
  const targetContainer = containerKey(containerId);

  if (activeContainer !== targetContainer || overContainer !== targetContainer) {
    return null;
  }

  const list = itemsInContainer(links, targetContainer);
  const oldIndex = list.findIndex((l) => sameId(l.id, activeId));
  const newIndex = list.findIndex((l) => sameId(l.id, overId));
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return null;

  const moved = arrayMove(list, oldIndex, newIndex);
  const next = links.map((l) => ({ ...l }));

  moved.forEach((item, index) => {
    const idx = next.findIndex((x) => sameId(x.id, item.id));
    if (idx === -1) return;
    next[idx] = {
      ...next[idx],
      sort_order: index,
      folder_id: targetContainer,
    };
  });

  return next;
}

/** Payload PATCH: solo visibili nel contenitore toccato + normalizzazione sort_order */
export function patchUpdatesForContainer(links, containerId) {
  const list = itemsInContainer(links, containerId);
  return list.map((l) => ({
    id: l.id,
    sort_order: l.sort_order,
    folder_id: l.folder_id ?? null,
  }));
}