'use client';

import { useEffect, useRef } from 'react';
import { OIAForm } from '../components/OIAForm';

// Force dynamic rendering to avoid hydration issues in iframe
export const dynamic = 'force-dynamic';

function postToParent(msg: unknown) { window.parent.postMessage(msg, '*'); }

function useAutoResize(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const h = Math.ceil(e.contentRect.height) + 100;
        postToParent({ type: 'OFA_CALCULATOR_RESIZE', height: h });
      }
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
}

/**
 * Form-only OIA embed. Landing pages can embed this and control the other half
 * (left side) themselves with custom content.
 */
export default function OIAFormPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  useAutoResize(rootRef);

  useEffect(() => {
    const theme = new URLSearchParams(window.location.search).get('theme') || 'light';
    if (document.body) document.body.dataset.theme = theme;
  }, []);

  return (
    <div ref={rootRef} style={{ padding: 16, maxWidth: 600, margin: '0 auto', position: 'relative' }}>
      <OIAForm />
    </div>
  );
}
