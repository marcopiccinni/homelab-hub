'use client';

import { useCallback, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
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
import { GripVertical } from 'lucide-react';
import { useFinePointerDnD } from '../hooks/useFinePointerDnD';
import {
  patchUpdatesForContainer,
  reorderLinksInContainer,
} from '../lib/dashboard-reorder';

const POINTER_DISTANCE = 8;

function SortableShell({ id, dragEnabled, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !dragEnabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`sortable-card-shell${isDragging ? ' is-dragging' : ''}`}
      data-sortable-id={id}
    >
      {dragEnabled ? (
        <button
          type="button"
          className="card-drag-handle"
          aria-label="Trascina per riordinare"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>
      ) : null}
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
}) {
  const dragEnabled = useFinePointerDnD();
  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: POINTER_DISTANCE },
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

  if (!dragEnabled) {
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
          <SortableShell key={link.id} id={link.id} dragEnabled={dragEnabled}>
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
