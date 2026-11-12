'use client';

import { useEffect, useState, useMemo } from 'react';
import { Settings } from 'lucide-react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X } from 'lucide-react';

function SortableItem({ link, links, onOpenFolder }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: link.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 999 : 'auto',
        touchAction: 'none', // Prevents scrolling while dragging on mobile
        backgroundColor: link.color ? link.color + '20' : undefined,
    };

    const isFolder = link.is_folder === 1;
    const folderItems = links ? links.filter(l => l.folder_id === link.id).sort((a, b) => a.sort_order - b.sort_order) : [];

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className="card"
            onClick={(e) => {
                if (isFolder && !isDragging) {
                    e.preventDefault();
                    onOpenFolder(link);
                }
            }}
        >
            {isFolder ? (
                <div style={{ pointerEvents: isDragging ? 'none' : 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', height: '100%' }}>
                    <div className="folder-grid">
                        {folderItems.slice(0, 4).map(item => (
                            <img key={item.id} src={item.icon || '/default-icon.svg'} className="folder-mini-icon" alt="" />
                        ))}
                    </div>
                    <span className="card-title">{link.title}</span>
                </div>
            ) : (
                <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        textDecoration: 'none',
                        color: 'inherit',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        width: '100%',
                        height: '100%',
                        pointerEvents: isDragging ? 'none' : 'auto'
                    }}
                    onClick={(e) => isDragging && e.preventDefault()}
                >
                    <img
                        src={link.icon || '/default-icon.svg'}
                        alt={link.title}
                        className="card-icon"
                        onError={(e) => {
                            e.target.src = '/default-icon.svg';
                        }}
                    />
                    <span className="card-title">{link.title}</span>
                </a>
            )}
        </div>
    );
}

export default function Dashboard() {
    const [links, setLinks] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeFolder, setActiveFolder] = useState(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // Minimum distance before drag starts (prevents accidental drags on click)
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const activeLink = useMemo(() => links.find((l) => l.id === activeId), [links, activeId]);
    const rootLinks = useMemo(() => links.filter((l) => !l.folder_id).sort((a, b) => a.sort_order - b.sort_order), [links]);
    const modalLinks = useMemo(() => activeFolder ? links.filter((l) => l.folder_id === activeFolder.id).sort((a, b) => a.sort_order - b.sort_order) : [], [links, activeFolder]);

    const handleDragStart = (event) => {
        setActiveId(event.active.id);
    };

    const handleDragEnd = async (event) => {
        const { active, over } = event;
        setActiveId(null);

        if (active.id !== over?.id) {
            // Determine if we are reordering root items or modal items based on presence of activeFolder
            const currentList = activeFolder ? modalLinks : rootLinks;
            
            const oldIndex = currentList.findIndex((l) => l.id === active.id);
            const newIndex = currentList.findIndex((l) => l.id === over.id);

            const newOrder = arrayMove(currentList, oldIndex, newIndex);
            
            // Reconstruct full links array
            const newLinks = [...links];
            newOrder.forEach((item, index) => {
                const globalIndex = newLinks.findIndex(l => l.id === item.id);
                if (globalIndex !== -1) {
                    newLinks[globalIndex] = { ...newLinks[globalIndex], sort_order: index };
                }
            });
            
            setLinks(newLinks);

            const updatedLinks = newOrder.map((link, index) => ({
                id: link.id,
                sort_order: index,
            }));

            try {
                await fetch('/api/links', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ updates: updatedLinks }),
                });
            } catch (error) {
                console.error('Failed to reorder:', error);
            }
        }
    };

    useEffect(() => {
        const loadLinks = async () => {
            try {
                const res = await fetch('/api/links');
                if (!res.ok) {
                    const text = await res.text();
                    throw new Error(`Server Error (${res.status}): ${text.substring(0, 100)}`);
                }
                const data = await res.json();
                setLinks(data);
            } catch (err) {
                console.error('Dashboard fetch error:', err);
            } finally {
                setLoading(false);
            }
        };
        loadLinks();
    }, []);

    if (loading) {
        return (
            <div className="container">
                <header className="header">
                    <h1 className="title">Caricamento...</h1>
                </header>
            </div>
        );
    }

    return (
        <div className="container">
            <header className="header">
                <h1 className="title">Intranet Dashboard</h1>
                <p className="subtitle">I tuoi servizi, organizzati con eleganza</p>
            </header>

            <main>
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext items={rootLinks.map(l => l.id)} strategy={rectSortingStrategy}>
                        <div className="grid">
                            {rootLinks.length > 0 ? (
                                rootLinks.map((link) => (
                                    <SortableItem key={link.id} link={link} links={links} onOpenFolder={setActiveFolder} />
                                ))
                            ) : (
                                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem', opacity: 0.6 }}>
                                    <p style={{ marginBottom: '1.5rem' }}>Nessun link salvato nella tua dashboard.</p>
                                    <a href="/admin" style={{
                                        padding: '0.8rem 2rem',
                                        borderRadius: '12px',
                                        backgroundColor: 'var(--md-sys-color-primary)',
                                        color: 'var(--md-sys-color-on-primary)',
                                        textDecoration: 'none',
                                        fontWeight: '600'
                                    }}>
                                        Configura Dashboard
                                    </a>
                                </div>
                            )}
                        </div>
                    </SortableContext>

                    <DragOverlay dropAnimation={{
                        sideEffects: defaultDropAnimationSideEffects({
                            styles: {
                                active: {
                                    opacity: '0.5',
                                },
                            },
                        }),
                    }}>
                        {activeId ? (
                            <div className="card" style={{ cursor: 'grabbing', scale: 1.05, backgroundColor: activeLink?.color ? activeLink.color + '20' : undefined }}>
                                {activeLink?.is_folder === 1 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', height: '100%' }}>
                                        <div className="folder-grid">
                                            {links.filter(l => l.folder_id === activeLink.id).slice(0, 4).map(item => (
                                                <img key={item.id} src={item.icon || '/default-icon.svg'} className="folder-mini-icon" alt="" />
                                            ))}
                                        </div>
                                        <span className="card-title">{activeLink.title}</span>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <img src={activeLink?.icon || '/default-icon.svg'} alt="" className="card-icon" />
                                        <span className="card-title">{activeLink?.title}</span>
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </DragOverlay>
                </DndContext>
            </main>

            <a href="/admin" className="admin-fab" title="Amministrazione">
                <Settings size={28} />
            </a>

            {/* Folder Modal */}
            {activeFolder && (
                <div className="modal-overlay" onClick={() => setActiveFolder(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 style={{ fontSize: '1.5rem', color: 'var(--md-sys-color-primary)', margin: 0 }}>{activeFolder.title}</h2>
                            <button className="modal-close" onClick={() => setActiveFolder(null)}>
                                <X size={24} />
                            </button>
                        </div>
                        
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext items={modalLinks.map(l => l.id)} strategy={rectSortingStrategy}>
                                <div className="grid modal-grid">
                                    {modalLinks.length > 0 ? (
                                        modalLinks.map((link) => (
                                            <SortableItem key={link.id} link={link} links={links} />
                                        ))
                                    ) : (
                                        <div style={{ gridColumn: '1/-1', textAlign: 'center', opacity: 0.5, padding: '2rem' }}>
                                            Gruppo vuoto
                                        </div>
                                    )}
                                </div>
                            </SortableContext>
                            
                            <DragOverlay dropAnimation={{
                                sideEffects: defaultDropAnimationSideEffects({
                                    styles: { active: { opacity: '0.5' } },
                                }),
                            }}>
                                {activeId ? (
                                    <div className="card" style={{ cursor: 'grabbing', scale: 1.05, backgroundColor: activeLink?.color ? activeLink.color + '20' : undefined }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <img src={activeLink?.icon || '/default-icon.svg'} alt="" className="card-icon" />
                                            <span className="card-title">{activeLink?.title}</span>
                                        </div>
                                    </div>
                                ) : null}
                            </DragOverlay>
                        </DndContext>
                    </div>
                </div>
            )}
        </div>
    );
}


