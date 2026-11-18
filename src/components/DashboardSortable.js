'use client';

import { useCallback, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  patchUpdatesForContainer,
  reorderLinksInContainer,
} from '../lib/dashboard-reorder';

const POINTER_DISTANCE = 6;

function SortableShell({ id, reorderMode, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !reorderMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`sortable-card-shell${reorderMode ? ' reorder-active' : ''}${isDragging ? ' is-dragging' : ''}`}
      data-sortable-id={id}
      {...(reorderMode ? { ...attributes, ...listeners } : {})}
    >
      {children}
    </div>
  );
}

async function persistOrder(links, containerId, setLinks, previousLinks) {
  const updates = patchUpdatesForContainer(links, containerId);
  try {
    const res = await fetch('/api/links', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
      cache: 'no-store',
    });
    if (!res.ok) {
      setLinks(previousLinks);
    }
  } catch {
    setLinks(previousLinks);
  }
}

export function DashboardSortableGrid({
  items,
  containerId = null,
  setLinks,
  linksSnapshotRef,
  renderCard,
  reorderMode = false,
}) {
  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: POINTER_DISTANCE },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const ids = items.map((l) => l.id);

  const onDragEnd = useCallback(
    async (event) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over || active.id === over.id) return;

      const snapshot = linksSnapshotRef.current;
      const previousLinks = snapshot.map((l) => ({ ...l }));
      const next = reorderLinksInContainer(
        snapshot,
        active.id,
        over.id,
        containerId
      );
      if (!next) return;

      linksSnapshotRef.current = next;
      setLinks(next);
      await persistOrder(next, containerId, setLinks, previousLinks);
    },
    [containerId, setLinks, linksSnapshotRef]
  );

  if (!reorderMode) {
    return (
      <>
        {items.map((link) => (
          <div key={link.id} data-sortable-id={link.id}>
            {renderCard(link)}
          </div>
        ))}
      </>
    );
  }

  const activeItem = activeId
    ? items.find((l) => l.id === activeId)
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(e) => setActiveId(e.active.id)}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        {items.map((link) => (
          <SortableShell
            key={link.id}
            id={link.id}
            reorderMode={reorderMode}
          >
            {renderCard(link)}
          </SortableShell>
        ))}
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <div className="card card-static card-drag-overlay" aria-hidden="true">
            <span className="card-title">{activeItem.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}