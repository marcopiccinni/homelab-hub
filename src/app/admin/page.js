'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import {
    DndContext,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    useDroppable
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Eye, EyeOff, Edit2, Trash2, Folder } from 'lucide-react';
import { safeImgSrc, safeColor } from '../../lib/validation';

function SortableRow({ link, handleToggleVisibility, handleEdit, handleDelete, isChild = false }) {
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
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: isChild ? '0.75rem 1rem' : '1rem',
        background: isDragging ? 'var(--md-sys-color-surface-container-high)' : (safeColor(link.color) ? safeColor(link.color) + '20' : (isChild ? 'rgba(255,255,255,0.03)' : 'var(--md-sys-color-surface-variant)')),
        borderRadius: isChild ? '16px' : '20px',
        border: '1px solid rgba(255,255,255,0.05)',
        boxShadow: isDragging ? '0 8px 16px rgba(0,0,0,0.3)' : 'none',
        touchAction: 'none',
        marginBottom: isChild ? '0' : '0.5rem',
    };

    return (
        <div ref={setNodeRef} style={style}>
            <div {...attributes} {...listeners} style={{ color: 'white', opacity: 0.4, cursor: 'grab' }}>
                <GripVertical size={20} />
            </div>

            <img
                src={safeImgSrc(link.icon)}
                width={isChild ? "32" : "44"} height={isChild ? "32" : "44"} alt=""
                style={{ borderRadius: '10px', background: 'rgba(0,0,0,0.2)', padding: '4px', objectFit: 'contain' }}
                onError={(e) => e.target.src = '/default-icon.svg'}
            />

            <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', fontSize: isChild ? '0.9rem' : '1rem' }}>{link.title}</div>
                <div className="admin-row-url">{link.url}</div>
            </div>

            <div className="admin-row-actions">
                <button onClick={() => handleToggleVisibility(link)} title="Nascondi" style={{ background: 'rgba(255,255,255,0.05)', border: 'none', padding: '0.5rem', borderRadius: '10px', color: 'white', cursor: 'pointer' }}>
                    <EyeOff size={16} />
                </button>
                <button onClick={() => handleEdit(link)} title="Modifica" style={{ background: 'var(--md-sys-color-secondary-container)', border: 'none', padding: '0.5rem', borderRadius: '10px', color: 'var(--md-sys-color-on-secondary-container)', cursor: 'pointer' }}>
                    <Edit2 size={16} />
                </button>
                <button onClick={() => handleDelete(link.id)} title="Elimina" style={{ background: 'none', border: 'none', color: 'var(--md-sys-color-error)', padding: '0.5rem', cursor: 'pointer' }}>
                    <Trash2 size={16} />
                </button>
            </div>
        </div>
    );
}

function SortableGroup({ group, childrenItems, handleToggleVisibility, handleEdit, handleDelete }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id });
    const { setNodeRef: setDroppableNodeRef, isOver } = useDroppable({ id: `group-${group.id}` });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 999 : 'auto',
        marginBottom: '1rem',
        background: safeColor(group.color) ? safeColor(group.color) + '20' : 'var(--md-sys-color-surface-variant)',
        borderRadius: '24px',
        border: '1px solid rgba(255,255,255,0.05)',
        padding: '1rem',
        touchAction: 'none',
    };

    const childIds = useMemo(() => childrenItems.map(l => l.id), [childrenItems]);

    return (
        <div ref={setNodeRef} style={style}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <div {...attributes} {...listeners} style={{ color: 'white', opacity: 0.4, cursor: 'grab' }}>
                    <GripVertical size={20} />
                </div>
                <Folder size={24} color="var(--md-sys-color-primary)" />
                <div style={{ flex: 1, fontWeight: 'bold', fontSize: '1.1rem' }}>{group.title}</div>
                
                <div className="admin-row-actions">
                    <button onClick={() => handleToggleVisibility(group)} title="Nascondi" style={{ background: 'rgba(255,255,255,0.05)', border: 'none', padding: '0.5rem', borderRadius: '10px', color: 'white', cursor: 'pointer' }}>
                        <EyeOff size={16} />
                    </button>
                    <button onClick={() => handleEdit(group)} title="Modifica" style={{ background: 'var(--md-sys-color-secondary-container)', border: 'none', padding: '0.5rem', borderRadius: '10px', color: 'var(--md-sys-color-on-secondary-container)', cursor: 'pointer' }}>
                        <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(group.id)} title="Elimina" style={{ background: 'none', border: 'none', color: 'var(--md-sys-color-error)', padding: '0.5rem', cursor: 'pointer' }}>
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>

            <div ref={setDroppableNodeRef} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: '60px', padding: '0.5rem', background: isOver ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.2)', borderRadius: '16px', transition: 'background 0.2s' }}>
                <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
                    {childrenItems.map(child => (
                        <SortableRow key={child.id} link={child} handleToggleVisibility={handleToggleVisibility} handleEdit={handleEdit} handleDelete={handleDelete} isChild />
                    ))}
                    {childrenItems.length === 0 && (
                        <div style={{ textAlign: 'center', opacity: 0.4, padding: '1rem', fontSize: '0.8rem' }}>Trascina i link qui per aggiungerli al gruppo</div>
                    )}
                </SortableContext>
            </div>
        </div>
    );
}

function RootDroppable({ children }) {
    const { setNodeRef, isOver } = useDroppable({ id: 'root' });
    return (
        <div ref={setNodeRef} style={{ minHeight: '100px', borderRadius: '24px', background: isOver ? 'rgba(255,255,255,0.02)' : 'transparent', padding: '0.5rem', transition: 'background 0.2s' }}>
            {children}
        </div>
    );
}

export default function AdminPage() {
    const [links, setLinks] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [title, setTitle] = useState('');
    const [url, setUrl] = useState('');
    const [icon, setIcon] = useState('');
    const [color, setColor] = useState('');
    const [isFolder, setIsFolder] = useState(false);
    const [folderId, setFolderId] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [loading, setLoading] = useState(true);
    const fileInputRef = useRef(null);
    const formDrawerRef = useRef(null);

    const sensors = useSensors(
        useSensor(PointerSensor, useMemo(() => ({
            activationConstraint: {
                distance: 8,
            },
        }), [])),
        useSensor(KeyboardSensor, useMemo(() => ({
            coordinateGetter: sortableKeyboardCoordinates,
        }), []))
    );

    const fetchLinks = async () => {
        try {
            const res = await fetch('/api/links?all=true', { cache: 'no-store' });
            if (!res.ok) throw new Error(`Server Error (${res.status})`);
            const data = await res.json();
            setLinks(data);
        } catch (err) {
            console.error('Fetch error:', err);
            alert('Errore nel caricamento dei link: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- client initial data load
        fetchLinks();
    }, []);

    useEffect(() => {
        const el = formDrawerRef.current;
        if (el && window.matchMedia('(min-width: 769px)').matches) {
            el.open = true;
        }
    }, []);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!title) return;
        if (!isFolder && !url) return;

        let fullUrl = url;
        if (!isFolder && url && !url.startsWith('http://') && !url.startsWith('https://')) {
            fullUrl = 'https://' + url;
        }

        const payload = {
            title,
            url: isFolder ? '' : fullUrl,
            icon: isFolder ? null : icon,
            color: color || null,
            is_folder: isFolder ? 1 : 0,
            folder_id: folderId ? parseInt(folderId) : null,
            sort_order: editingId ? undefined : links.length,
            visible: editingId ? (links.find(l => l.id === editingId)?.visible ?? 1) : 1
        };

        const method = editingId ? 'PUT' : 'POST';
        const endpoint = editingId ? `/api/links/${editingId}` : '/api/links';

        try {
            const res = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                cache: 'no-store',
            });
            if (!res.ok) throw new Error(`Server Error`);
            resetForm();
            fetchLinks();
        } catch (err) {
            console.error('Save error:', err);
            alert('Errore nel salvataggio');
        }
    };

    const handleToggleVisibility = async (link) => {
        const res = await fetch(`/api/links/${link.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...link, visible: link.visible === 1 ? 0 : 1 }),
            cache: 'no-store',
        });
        if (res.ok) fetchLinks();
    };

    const resetForm = () => {
        setTitle('');
        setUrl('');
        setIcon('');
        setColor('');
        setIsFolder(false);
        setFolderId('');
        setEditingId(null);
    };

    const handleEdit = (link) => {
        setEditingId(link.id);
        setTitle(link.title);
        setUrl(link.url || '');
        setIcon(link.icon || '');
        setColor(link.color || '');
        setIsFolder(link.is_folder === 1);
        setFolderId(link.folder_id ? link.folder_id.toString() : '');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id) => {
        if (confirm('Sei sicuro di voler eliminare questo elemento?')) {
            const res = await fetch(`/api/links/${id}`, { method: 'DELETE', cache: 'no-store' });
            if (res.ok) fetchLinks();
        }
    };

    const visibleLinks = useMemo(() => links.filter(l => l.visible === 1), [links]);
    const hiddenLinks = useMemo(() => links.filter(l => l.visible === 0), [links]);
    const allFolders = useMemo(() => links.filter(l => l.is_folder === 1), [links]);
    
    const rootLinks = useMemo(() => visibleLinks.filter(l => l.folder_id === null).sort((a,b) => a.sort_order - b.sort_order), [visibleLinks]);
    const rootIds = useMemo(() => rootLinks.map(l => l.id), [rootLinks]);
    const activeLink = useMemo(() => links.find(l => l.id === activeId), [links, activeId]);

    const handleDragStart = (event) => {
        setActiveId(event.active.id);
    };

    const handleDragOver = (event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const activeItem = links.find(l => String(l.id) === String(active.id));
        if (!activeItem || activeItem.is_folder === 1) return; // I gruppi si muovono solo nella root

        let overContainerId = null;
        if (over.id === 'root') {
            overContainerId = null;
        } else if (String(over.id).startsWith('group-')) {
            overContainerId = parseInt(String(over.id).replace('group-', ''));
        } else {
            const overItem = links.find(l => String(l.id) === String(over.id));
            if (overItem) {
                overContainerId = overItem.is_folder === 1 ? overItem.id : overItem.folder_id;
            } else {
                // Se non troviamo l'elemento, potrebbe essere un droppable che non abbiamo gestito
                return;
            }
        }

        if (overContainerId !== undefined) {
            setLinks(prev => {
                const idx = prev.findIndex(l => String(l.id) === String(active.id));
                if (idx === -1) return prev;
                
                const currentContainerId = prev[idx].folder_id;
                
                // IMPORTANTE: Confronto robusto tra null e numeri/stringhe
                const isSameContainer = (currentContainerId === overContainerId) || 
                                       (currentContainerId == overContainerId);
                
                if (isSameContainer) return prev;

                const newLinks = [...prev];
                newLinks[idx] = { ...newLinks[idx], folder_id: overContainerId };
                return newLinks;
            });
        }
    };

    const handleDragEnd = async (event) => {
        const { active, over } = event;
        setActiveId(null);
        if (!over) {
            fetchLinks();
            return;
        }

        let currentLinks = [...links];
        const activeItem = currentLinks.find(l => String(l.id) === String(active.id));
        const containerId = activeItem?.folder_id || null;

        const overItem = currentLinks.find(l => String(l.id) === String(over.id));
        let overContainerId = null;
        if (over.id === 'root') overContainerId = null;
        else if (String(over.id).startsWith('group-')) overContainerId = parseInt(String(over.id).replace('group-', ''));
        else if (overItem) {
            // Se stiamo trascinando un GRUPPO, il suo overContainerId è sempre null (i gruppi stanno nella root)
            if (activeItem.is_folder === 1) {
                 overContainerId = null;
            } else {
                 overContainerId = overItem.is_folder === 1 ? overItem.id : overItem.folder_id;
            }
        }

        if (overItem && String(active.id) !== String(over.id) && containerId == overContainerId) {
            // Entrambi nello stesso contenitore, possiamo fare arrayMove
            const containerItems = currentLinks.filter(l => l.visible === 1 && (l.folder_id === containerId || l.folder_id == containerId)).sort((a,b) => a.sort_order - b.sort_order);
            const oldIndex = containerItems.findIndex(l => String(l.id) === String(active.id));
            const newIndex = containerItems.findIndex(l => String(l.id) === String(over.id));

            if (oldIndex !== -1 && newIndex !== -1) {
                const newOrder = arrayMove(containerItems, oldIndex, newIndex);
                newOrder.forEach((item, index) => {
                     const idx = currentLinks.findIndex(l => l.id === item.id);
                     currentLinks[idx] = { ...currentLinks[idx], sort_order: index };
                });
            }
        }

        // Normalizza tutti i sort_order per evitare buchi
        const finalLinks = [];
        const containers = [null, ...currentLinks.filter(l => l.is_folder === 1).map(l => l.id)];
        
        containers.forEach(cid => {
             const items = currentLinks.filter(l => l.visible === 1 && l.folder_id === cid).sort((a,b) => a.sort_order - b.sort_order);
             items.forEach((item, index) => {
                  finalLinks.push({ ...item, sort_order: index });
             });
        });

        const hidden = currentLinks.filter(l => l.visible === 0);
        const totalLinks = [...finalLinks, ...hidden];
        const previousLinks = links;
        setLinks(totalLinks);

        const updates = finalLinks.map((l) => ({
            id: l.id,
            sort_order: l.sort_order,
            folder_id: l.folder_id,
        }));

        try {
            const res = await fetch('/api/links', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ updates }),
                cache: 'no-store',
            });
            if (!res.ok) {
                setLinks(previousLinks);
                await fetchLinks();
            }
        } catch {
            setLinks(previousLinks);
            await fetchLinks();
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
            cache: 'no-store',
        });

        if (res.ok) {
            const data = await res.json();
            setIcon(data.url);
        }
    };

    const handleVerify = async () => {
        if (!url) return;
        setLoading(true);
        try {
            const res = await fetch('/api/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
                cache: 'no-store',
            });
            const data = await res.json();
            if (!data.reachable) alert('Attenzione: Il sito non sembra raggiungibile.');
            if (data.iconUrl) {
                if (icon && icon !== data.iconUrl) {
                    if (confirm('È stata trovata una nuova icona. Vuoi sovrascrivere?')) setIcon(data.iconUrl);
                } else setIcon(data.iconUrl);
            }
            if (data.finalUrl && !url.startsWith('http')) setUrl(data.finalUrl);
        } catch (err) {
            alert('Errore durante la verifica: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container admin-page">
            <header className="header header-once">
                <h1 className="title">Amministrazione</h1>
                <p className="subtitle">Gestisci i tuoi collegamenti</p>
                <nav className="admin-nav-links" aria-label="Navigazione">
                    <Link href="/">← Dashboard</Link>
                    <span className="nav-sep" aria-hidden="true">|</span>
                    <Link href="/admin/network">Analisi di rete</Link>
                </nav>
            </header>

            <details ref={formDrawerRef} className="admin-form-drawer">
                <summary>
                    {editingId ? 'Modifica elemento' : 'Aggiungi collegamento (tocca per aprire)'}
                </summary>
                <form onSubmit={handleSave} className="admin-form-panel">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <input 
                            type="checkbox" 
                            id="isFolderCheckbox" 
                            checked={isFolder} 
                            onChange={(e) => setIsFolder(e.target.checked)} 
                            style={{ width: '1.2rem', height: '1.2rem', cursor: 'pointer' }}
                        />
                        <label htmlFor="isFolderCheckbox" style={{ cursor: 'pointer', fontWeight: 'bold' }}>Questo è un Gruppo (raggruppa altri link)</label>
                    </div>

                    <div className="admin-form-grid">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.8rem', opacity: 0.8 }}>Titolo</label>
                            <input type="text" placeholder={isFolder ? "Es. Smart Home" : "Es. Home Assistant"} value={title} onChange={(e) => setTitle(e.target.value)} />
                        </div>
                        {!isFolder && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <label style={{ fontSize: '0.8rem', opacity: 0.8 }}>URL</label>
                            <div className="admin-url-row">
                                <input type="text" placeholder="Es. homeassistant.local" value={url} onChange={(e) => setUrl(e.target.value)} />
                                <button type="button" className="btn-verify" onClick={handleVerify} disabled={!url || loading}>
                                    {loading ? '…' : 'Verifica'}
                                </button>
                            </div>
                        </div>
                        )}
                        {!isFolder && allFolders.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', gridColumn: '1 / -1' }}>
                                <label style={{ fontSize: '0.8rem', opacity: 0.8 }}>Gruppo di appartenenza (opzionale)</label>
                                <select value={folderId} onChange={(e) => setFolderId(e.target.value)} style={{ padding: '1rem', borderRadius: '16px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '1rem' }}>
                                    <option value="">-- Nessun gruppo (mostra nella home) --</option>
                                    {allFolders.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
                                </select>
                            </div>
                        )}
                    </div>

                    {!isFolder && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.8rem', opacity: 0.8 }}>Icona (URL o Upload)</label>
                        <div className="admin-icon-row">
                            {icon && <img src={safeImgSrc(icon)} alt="" width={44} height={44} style={{ borderRadius: '8px', background: 'rgba(0,0,0,0.1)' }} />}
                            <input type="text" placeholder="URL immagine (opzionale)" value={icon} onChange={(e) => setIcon(e.target.value)} />
                            <button type="button" className="btn-verify" onClick={() => fileInputRef.current.click()}>Carica</button>
                            <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} accept="image/png,image/jpeg,image/webp,image/gif,image/x-icon,image/vnd.microsoft.icon" />
                        </div>
                    </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.8rem', opacity: 0.8 }}>Colore Sfondo Sbiadito (opzionale)</label>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <input type="color" value={color || '#e2e8f0'} onChange={(e) => setColor(e.target.value)} style={{ width: '40px', height: '40px', padding: 0, border: 'none', borderRadius: '8px', cursor: 'pointer', background: 'transparent' }} />
                            <button type="button" onClick={() => setColor('')} style={{ padding: '0.5rem 1rem', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', cursor: 'pointer', fontSize: '0.8rem' }}>Usa Default</button>
                            {color && (
                                <div style={{ marginLeft: '1rem', fontSize: '0.8rem', opacity: 0.8, padding: '0.5rem 1rem', background: color + '33', borderRadius: '8px', border: `1px solid ${color}40`, color: 'white' }}>
                                    Anteprima Colore
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button type="submit" disabled={loading} style={{ flex: 1, padding: '1rem', borderRadius: '16px', border: 'none', background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', fontWeight: 'bold', opacity: loading ? 0.5 : 1, cursor: 'pointer' }}>
                            {editingId ? 'Salva Modifiche' : (isFolder ? 'Aggiungi Gruppo' : 'Aggiungi Link')}
                        </button>
                        {editingId && (
                            <button type="button" onClick={resetForm} style={{ padding: '1rem', borderRadius: '16px', border: 'none', background: 'var(--md-sys-color-surface)', color: 'var(--md-sys-color-on-surface)', cursor: 'pointer' }}>Annulla</button>
                        )}
                    </div>
                </form>
            </details>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCorners}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                >
                    <RootDroppable>
                        <SortableContext items={rootIds} strategy={verticalListSortingStrategy}>
                            <h2 className="admin-list-title">Collegamenti visibili</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', minHeight: '50px' }}>
                                {rootLinks.map((link) => {
                                    if (link.is_folder === 1) {
                                        const children = visibleLinks.filter(l => l.folder_id === link.id).sort((a,b) => a.sort_order - b.sort_order);
                                        return <SortableGroup key={link.id} group={link} childrenItems={children} handleToggleVisibility={handleToggleVisibility} handleEdit={handleEdit} handleDelete={handleDelete} />;
                                    }
                                    return <SortableRow key={link.id} link={link} handleToggleVisibility={handleToggleVisibility} handleEdit={handleEdit} handleDelete={handleDelete} />;
                                })}
                                {rootLinks.length === 0 && (
                                    <div style={{ opacity: 0.5, textAlign: 'center', padding: '1rem' }}>Nessun elemento nella root. Trascinane qui uno.</div>
                                )}
                            </div>
                        </SortableContext>
                    </RootDroppable>
                    
                    <DragOverlay>
                        {activeId ? (
                            activeLink?.is_folder === 1 ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'var(--md-sys-color-surface-container-high)', borderRadius: '24px', boxShadow: '0 12px 24px rgba(0,0,0,0.4)', opacity: 0.9, scale: 1.02 }}>
                                    <GripVertical size={20} style={{ opacity: 0.4 }} />
                                    <Folder size={24} color="var(--md-sys-color-primary)" />
                                    <div style={{ flex: 1, fontWeight: 'bold' }}>{activeLink?.title}</div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'var(--md-sys-color-surface-container-high)', borderRadius: '20px', boxShadow: '0 12px 24px rgba(0,0,0,0.4)', opacity: 0.9, scale: 1.02 }}>
                                    <GripVertical size={20} style={{ opacity: 0.4 }} />
                                    <img src={safeImgSrc(activeLink?.icon)} width="44" height="44" alt="" style={{ borderRadius: '10px', background: 'rgba(0,0,0,0.2)', padding: '4px', objectFit: 'contain' }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 'bold' }}>{activeLink?.title}</div>
                                        <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>{activeLink?.url}</div>
                                    </div>
                                </div>
                            )
                        ) : null}
                    </DragOverlay>
                </DndContext>

                {hiddenLinks.length > 0 && (
                    <div>
                        <h2 style={{ fontSize: '1.2rem', color: 'var(--md-sys-color-secondary)', marginBottom: '1rem', opacity: 0.8 }}>Elementi Nascosti</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', opacity: 0.7 }}>
                            {hiddenLinks.map((link) => (
                                <div key={link.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '20px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                                    {link.is_folder === 1 ? <Folder size={24} color="gray" /> : <img src={safeImgSrc(link.icon)} width="40" height="40" alt="" style={{ borderRadius: '8px', background: 'rgba(0,0,0,0.2)', padding: '4px', filter: 'grayscale(1)', objectFit: 'contain' }} />}
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 'bold', opacity: 0.6 }}>{link.title}</div>
                                        {link.is_folder !== 1 && <div style={{ fontSize: '0.8rem', opacity: 0.4 }}>{link.url}</div>}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button onClick={() => handleToggleVisibility(link)} style={{ background: 'var(--md-sys-color-primary)', border: 'none', padding: '0.5rem 1rem', borderRadius: '12px', color: 'var(--md-sys-color-on-primary)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}><Eye size={16} /> Mostra</button>
                                        <button onClick={() => handleEdit(link)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', padding: '0.5rem 1rem', borderRadius: '12px', color: 'white', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}><Edit2 size={16} /> Edit</button>
                                        <button onClick={() => handleDelete(link.id)} style={{ background: 'none', border: 'none', color: 'var(--md-sys-color-error)', fontWeight: 'bold', padding: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>Elimina</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
