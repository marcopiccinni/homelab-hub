'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function NetworkAnalysis() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/network', { cache: 'no-store' })
            .then(res => res.json())
            .then(report => {
                setData(report);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    return (
        <div className="container">
            <header className="header">
                <h1 className="title">Analisi di Rete</h1>
                <p className="subtitle">Mappa degli host e delle porte utilizzate</p>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <Link href="/admin" style={{ color: 'var(--md-sys-color-primary)', textDecoration: 'none' }}>← Torna Amministrazione</Link>
                    <span style={{ opacity: 0.3 }}>|</span>
                    <Link href="/" style={{ color: 'var(--md-sys-color-primary)', textDecoration: 'none' }}>Vai Dashboard</Link>
                </div>
            </header>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem', opacity: 0.6 }}>Analisi in corso...</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '2rem' }}>
                    {data.length > 0 ? (
                        data.map((item) => (
                            <div key={item.host} style={{
                                background: 'var(--md-sys-color-surface-variant)',
                                padding: '1.5rem',
                                borderRadius: '24px',
                                border: '1px solid rgba(255,255,255,0.05)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <div>
                                    <h3 style={{ margin: 0, color: 'var(--md-sys-color-primary)', fontSize: '1.2rem' }}>{item.host}</h3>
                                    <p style={{ margin: '0.5rem 0 0 0', opacity: 0.7, fontSize: '0.85rem' }}>
                                        {item.ports.length} port{item.ports.length === 1 ? 'a rilevata' : 'e rilevate'}
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '50%' }}>
                                    {item.ports.map(port => (
                                        <span key={port} style={{
                                            background: 'var(--md-sys-color-secondary-container)',
                                            color: 'var(--md-sys-color-on-secondary-container)',
                                            padding: '0.4rem 1rem',
                                            borderRadius: '12px',
                                            fontSize: '0.9rem',
                                            fontWeight: 'bold'
                                        }}>
                                            :{port}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div style={{ textAlign: 'center', padding: '4rem', opacity: 0.6 }}>
                            Nessun host rilevato. Aggiungi dei link per iniziare l&apos;analisi.
                        </div>
                    )}
                </div>
            )}

            <footer style={{ marginTop: '4rem', textAlign: 'center', opacity: 0.5, fontSize: '0.8rem' }}>
                Questa analisi è basata esclusivamente sui link salvati nel database locale.
            </footer>
        </div>
    );
}
