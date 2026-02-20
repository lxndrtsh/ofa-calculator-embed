'use client';

import { useEffect, useRef, useState } from 'react';
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

// Content for each step in the Content View (left column)
const stepContent: Record<number, Record<string, unknown>> = {
  1: {
    title: 'Understanding Your Plan\'s Impact',
    description: 'Opioid dependency can have a significant financial and human impact on your health plan. By understanding the scope of the challenge, you can take proactive steps to address it.',
    bullets: [
      'Identify at-risk members in your plan',
      'Understand the financial implications',
      'Discover potential savings opportunities'
    ]
  },
  2: {
    title: 'Almost there.',
    description: 'We will use the details you provide to deliver an accurate estimate, proven case studies and a \'return on community\' (ROC) report. Your estimate appears instantly and a more comprehensive report is sent securely to your inbox.',
    exampleLabel: 'EXAMPLE:',
    hasImage: true
  },
  3: {
    title: 'PROVEN OUTCOMES.\nREAL SAVINGS.',
    subheading: 'Protecting lives, families, and communities – while addressing 3-5% of health plan spend.',
    bullets: [
      'NO DISRUPTION.',
      'NO PHI EXPOSURE',
      'NO TECHNOLOGY INSTALLATION.'
    ],
    subheading2: 'This is not a point solution. It is a strategy – deployable at any time.'
  }
};

export default function FullOIAPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  useAutoResize(rootRef);
  const [step, setStep] = useState(1);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return;
    const theme = new URLSearchParams(window.location.search).get('theme') || 'light';
    if (document.body) document.body.dataset.theme = theme;
  }, [mounted]);

  const currentContent = stepContent[step] ?? stepContent[1];

  return (
    <div ref={rootRef} style={{ padding: 16, maxWidth: 1200, margin: '0 auto', position: 'relative' }}>
      <div className="two-column-layout" style={{ alignItems: 'start' }}>
        {/* Left Column: Content View */}
        <div className="content-view" style={{
          padding: step === 1 ? 0 : 24,
          background: step === 1 ? 'transparent' : '#f9fafb',
          borderRadius: 8,
          minHeight: step === 1 ? 'auto' : 400,
          position: 'sticky',
          top: 16,
          alignSelf: 'flex-start'
        }}>
          {step === 1 ? (
            <>
              <img src="/images/SchoolDistrictCaseStudy.jpg" alt="School District Case Study" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8, marginBottom: 24 }} />
              <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 16, marginTop: 0 }}>Imagine your health plan achieving similar results.</h3>
              <p style={{ color: '#333', fontSize: '1rem', marginBottom: 0, lineHeight: 1.6 }}>This Florida school district recently committed to a 5-year renewal after realizing $1.35 million in first-year savings.</p>
            </>
          ) : step === 2 ? (
            <>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 16, marginTop: 0 }}>{String(currentContent.title)}</h3>
              <p style={{ color: '#333', fontSize: '1rem', marginBottom: 24, lineHeight: 1.6 }}>{String(currentContent.description || currentContent.subheading || '')}</p>
              <div style={{ marginTop: 24 }}>
                <strong style={{ fontSize: '1rem', fontWeight: 700, color: '#333', display: 'block', marginBottom: 12 }}>{String(currentContent.exampleLabel || '')}</strong>
                <img src="/images/ExampleResult2.png" alt="Example Result" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }} />
              </div>
            </>
          ) : step === 3 ? (
            <>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 16, marginTop: 0, whiteSpace: 'pre-line' }}>{String(currentContent.title)}</h3>
              {'subheading' in currentContent && <p style={{ color: '#333', fontSize: '1rem', marginBottom: 24, lineHeight: 1.6 }}>{String(currentContent.subheading)}</p>}
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px 0' }}>
                {Array.isArray(currentContent.bullets) && (currentContent.bullets as string[]).map((bullet, idx) => (
                  <li key={idx} style={{ marginBottom: 12, fontSize: '1rem', lineHeight: 1.5, color: '#333' }}>{bullet}</li>
                ))}
              </ul>
              {'subheading2' in currentContent && <p style={{ color: '#333', fontSize: '1rem', marginBottom: 0, lineHeight: 1.6 }}>{String(currentContent.subheading2)}</p>}
            </>
          ) : (
            <>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 16, marginTop: 0 }}>{String(currentContent.title)}</h3>
              {'description' in currentContent && <p style={{ color: '#333', fontSize: '1rem', marginBottom: 24, lineHeight: 1.6 }}>{String(currentContent.description)}</p>}
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {Array.isArray(currentContent.bullets) && (currentContent.bullets as string[]).map((bullet, idx) => (
                  <li key={idx} style={{ marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span style={{ color: '#22c55e', fontSize: '1.25rem', lineHeight: 1.5, marginTop: 2 }}>✓</span>
                    <span style={{ fontSize: '1rem', lineHeight: 1.5, color: '#333' }}>{bullet}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Right Column: Form (shared OIAForm component) */}
        <OIAForm onStepChange={setStep} />
      </div>

      <style jsx>{`
        h3, p { font-family: Lato, sans-serif; }
        .two-column-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
        @media (max-width: 768px) {
          .two-column-layout { grid-template-columns: 1fr; gap: 24px; }
          .content-view { position: relative !important; top: auto !important; }
        }
      `}</style>
    </div>
  );
}
