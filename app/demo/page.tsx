'use client';
import { useEffect, useRef } from 'react';

// Helper to set a cookie
function setCookie(name: string, value: string, days: number = 7) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

export default function DemoHost() {
  const impactInitialized = useRef(false);
  const fullOiaInitialized = useRef(false);
  
  // Set test referral cookie locally only
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      setCookie('referral', 'SRX25-TASH', 1); // Set for 1 day, only on localhost
      console.log('Demo: Set test referral cookie "SRX25-TASH" for localhost testing');
    }
  }, []);
  
  useEffect(() => {
    // Initialize Impact form
    if (impactInitialized.current) return;
    
    const impactContainer = document.getElementById('impact-mount');
    if (impactContainer && impactContainer.querySelector('iframe')) {
      impactInitialized.current = true;
      return;
    }
    
    impactInitialized.current = true;
    
    const existingImpactScript = document.querySelector('script[src="/cdn/leadcalc-impact.min.js"]');
    if (existingImpactScript) {
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
    
    const s1 = document.createElement('script');
    s1.src = '/cdn/leadcalc-impact.min.js';
    s1.onload = () => {
      // @ts-ignore
      window.OFACalculator?.init('impact-mount', {
        apiBase: window.location.origin,
        iframeBase: window.location.origin,
        configVersion: 'dev',
        theme: 'light',
        referralCookie: 'referral'
      });
    };
    document.body.appendChild(s1);
  }, []);

  useEffect(() => {
    // Initialize Full OIA form
    if (fullOiaInitialized.current) return;
    
    const fullOiaContainer = document.getElementById('full-oia-mount');
    if (fullOiaContainer && fullOiaContainer.querySelector('iframe')) {
      fullOiaInitialized.current = true;
      return;
    }
    
    fullOiaInitialized.current = true;
    
    const existingFullOiaScript = document.querySelector('script[src="/cdn/leadcalc-full-oia.min.js"]');
    if (existingFullOiaScript) {
      // @ts-ignore
      window.OFACalculator?.init('full-oia-mount', {
        apiBase: window.location.origin,
        iframeBase: window.location.origin,
        configVersion: 'dev',
        theme: 'light',
        referralCookie: 'referral'
      });
      return;
    }
    
    const s2 = document.createElement('script');
    s2.src = '/cdn/leadcalc-full-oia.min.js';
    s2.onload = () => {
      // @ts-ignore
      window.OFACalculator?.init('full-oia-mount', {
        apiBase: window.location.origin,
        iframeBase: window.location.origin,
        configVersion: 'dev',
        theme: 'light',
        referralCookie: 'referral'
      });
    };
    document.body.appendChild(s2);
  }, []);

  return (
    <main style={{padding:24}}>
      <h1>Demo Host Page</h1>
      <p>This simulates a client website. The loader scripts insert the iframes below.</p>
      
      <div style={{ marginBottom: '48px' }}>
        <h2>Impact Analysis Form</h2>
        <div id="impact-mount" style={{ maxWidth: 720 }} />
      </div>
      
      <div style={{ marginBottom: '48px' }}>
        <h2>Opioid Impact Estimate (Full OIA)</h2>
        <div id="full-oia-mount" style={{ maxWidth: 1200 }} />
      </div>
    </main>
  );
}
