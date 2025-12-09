'use client';
import { useEffect, useRef } from 'react';
export default function DemoHost() {
  const initialized = useRef(false);
  useEffect(() => {
    // Guard against double initialization in Strict Mode
    if (initialized.current) return;
    
    // Check if container already has an iframe (already initialized)
    const container = document.getElementById('impact-mount');
    if (container && container.querySelector('iframe')) {
      initialized.current = true;
      return;
    }
    
    initialized.current = true;
    
    // Check if script already exists
    const existingScript = document.querySelector('script[src="/cdn/leadcalc-impact.min.js"]');
    if (existingScript) {
      // Script already loaded, just init
      // @ts-ignore
      window.OFACalculator?.init('impact-mount', {
        apiBase: window.location.origin,
        iframeBase: window.location.origin,
        configVersion: 'dev',
        theme: 'light',
        referralCookie: 'referral'
      });
      return;
    }
    
    const s = document.createElement('script');
    s.src = '/cdn/leadcalc-impact.min.js';
    s.onload = () => {
      // @ts-ignore
      window.OFACalculator?.init('impact-mount', {
        apiBase: window.location.origin,
        iframeBase: window.location.origin,
        configVersion: 'dev',
        theme: 'light',
        referralCookie: 'referral'
      });
    };
    document.body.appendChild(s);
  }, []);
  return (
    <main style={{padding:24}}>
      <h1>Demo Host Page</h1>
      <p>This simulates a client website. The loader script inserts the Impact iframe below.</p>
      <div id="impact-mount" style={{ maxWidth: 720 }} />
    </main>
  );
}
