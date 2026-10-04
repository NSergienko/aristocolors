'use client';

import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export function CreateProjectCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Choose a PNG, JPEG, or WebP image.');
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Could not read the image.'));
        reader.onabort = () => reject(new Error('Image reading was cancelled.'));
        reader.readAsDataURL(file);
      });
      // Confirm the file can be decoded before leaving Projects.
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const token = crypto.randomUUID();
      sessionStorage.setItem(`aristocolors:local-import:${token}`, JSON.stringify({ dataUrl, name: file.name }));
      router.push(`/projects/proj-obsidian-launch?localImport=${token}`);
    } catch {
      setError('Could not open this image. Try a smaller PNG, JPEG, or WebP file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '220px', display: 'flex', flexDirection: 'column' }}>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleFile} />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        style={{
          flex: 1, borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-medium)',
          backgroundColor: 'var(--surface-1)', padding: '24px 20px', display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          cursor: busy ? 'wait' : 'pointer', color: 'var(--text-primary)', gap: '14px',
        }}
      >
        <span aria-hidden="true" style={{ color: 'var(--accent-cyan)', fontSize: '32px' }}>+</span>
        <span style={{ fontFamily: 'var(--font-brand)', fontSize: '15px', fontWeight: 600 }}>New Project</span>
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{busy ? 'Opening image…' : 'Choose a PNG, JPEG, or WebP image'}</span>
      </button>
      {error && <p role="alert" style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{error}</p>}
    </div>
  );
}
