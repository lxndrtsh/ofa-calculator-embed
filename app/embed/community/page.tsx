'use client';
import { useEffect, useRef, useState } from 'react';
import { formatPhoneNumber, cleanPhoneNumber } from '../utils/inputMask';
import { MapPin, User, FileText, Check } from 'lucide-react';
import { US_STATES, getCountiesForState, getCountyRate, convertRateToOpioidRxRate } from '../utils/countyData';

// Force dynamic rendering to avoid hydration issues in iframe
export const dynamic = 'force-dynamic';
type Boot = { apiBase: string; configVersion: string; theme: 'light'|'dark'|string; referralToken: string|null; };
function postToParent(msg: any) { window.parent.postMessage(msg, '*'); }
function useBoot(): Boot|null {
  const [boot, setBoot] = useState<Boot|null>(null);
  useEffect(() => {
    function onMsg(ev: MessageEvent) { if (ev.data?.type === 'OFA_CALCULATOR_BOOT') setBoot(ev.data.payload as Boot); }
    window.addEventListener('message', onMsg);
    postToParent({ type: 'OFA_CALCULATOR_READY' });
    return () => window.removeEventListener('message', onMsg);
  }, []);
  return boot;
}
function useAutoResize(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const h = Math.ceil(e.contentRect.height) + 100; // Add 100px padding
        postToParent({ type: 'OFA_CALCULATOR_RESIZE', height: h });
      }
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
}

export default function CommunityPage() {
  const boot = useBoot();
  const rootRef = useRef<HTMLDivElement>(null);
  useAutoResize(rootRef);
  const [cfg, setCfg] = useState<any>(null);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showDev, setShowDev] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [form, setForm] = useState({ 
    city: '', 
    state: '', 
    county: '', 
    population: '', 
    firstName: '', 
    lastName: '', 
    email: '', 
    phone: '', 
    company: '', 
    title: '' 
  });
  const [mounted, setMounted] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [counties, setCounties] = useState<Array<{ value: string; label: string }>>([]);
  const [countyRate, setCountyRate] = useState<number | null>(null);
  const [apiResults, setApiResults] = useState<any>(null);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return;
    const search = new URLSearchParams(window.location.search);
    const v = search.get('v') || process.env.NEXT_PUBLIC_CONFIG_VERSION || 'dev';
    const theme = search.get('theme') || process.env.NEXT_PUBLIC_IFRAME_THEME || 'light';
    if (document.body) {
      document.body.dataset.theme = theme;
    }
    if (!boot) return;
    fetch(`${boot.apiBase}/api/config?version=${encodeURIComponent(v)}&form=community`).then(r => r.json()).then(setCfg).catch(console.error);
  }, [boot, mounted]);

  // Load counties when state changes
  useEffect(() => {
    const apiBase = boot?.apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
    console.log('County loading useEffect triggered:', { state: form.state, boot: !!boot, apiBase });
    
    if (form.state) {
      console.log('Calling getCountiesForState with:', form.state, apiBase);
      getCountiesForState(form.state, apiBase)
        .then(counties => {
          console.log('Counties loaded:', counties.length, counties);
          setCounties(counties);
        })
        .catch(error => {
          console.error('Error loading counties:', error);
          setCounties([]);
        });
    } else {
      console.log('Clearing counties - state is empty');
      setCounties([]);
      setForm(f => ({ ...f, county: '' }));
    }
  }, [form.state, boot]);

  // Load county rate when state and county change
  useEffect(() => {
    const apiBase = boot?.apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
    if (form.state && form.county) {
      getCountyRate(form.state, form.county, apiBase).then(rate => {
        setCountyRate(rate);
      });
    } else {
      setCountyRate(null);
    }
  }, [form.state, form.county, boot]);

  // Use API results if available, otherwise calculate for preview (before submit)
  const pop = Number(form.population || 0);
  const members = apiResults?.members ?? pop;
  const withRx = apiResults?.withRx ?? (cfg ? Math.round(members * cfg.math.rx_rate) : 0);
  const opioidRxRate = apiResults?.opioidRxRate ?? (countyRate !== null ? convertRateToOpioidRxRate(countyRate) : (cfg ? cfg.math.opioid_rx_rate : 0.2));
  const withORx = apiResults?.withORx ?? (cfg ? Math.round(withRx * opioidRxRate) : 0);
  const atRisk = apiResults?.atRisk ?? (cfg ? Math.round(withORx * cfg.math.at_risk_rate) : 0);
  const prescribers = apiResults?.prescribers ?? (cfg ? Math.round(atRisk * cfg.math.prescriber_non_cdc_rate) : 0);

  // Step validation
  const validateStep1 = () => {
    return form.state.trim() !== '' && 
           form.county.trim() !== '' && 
           form.population && 
           Number(form.population) > 0;
  };

  const validateStep2 = () => {
    return form.firstName.trim() !== '' && 
           form.lastName.trim() !== '' && 
           form.email.trim() !== '' && 
           /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  };

  const handlePhoneChange = (value: string) => {
    const formatted = formatPhoneNumber(value);
    setForm({...form, phone: formatted});
  };

  const handleLookup = async () => {
    if (!boot || lookupLoading || !form.state || !form.county || form.county === 'County Not Listed') return;
    setLookupLoading(true);
    try {
      const response = await fetch(`${boot.apiBase}/api/lookup/population?state=${encodeURIComponent(form.state)}&county=${encodeURIComponent(form.county)}`);
      const data = await response.json();
      setForm(f => ({...f, population: data?.population ? String(data.population) : ''}));
    } catch (error) {
      console.error('Lookup error:', error);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) {
      setCompletedSteps([1]);
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      setCompletedSteps([1, 2]);
      setStep(3);
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleStepClick = (stepNum: number) => {
    if (completedSteps.includes(stepNum) || stepNum < step) {
      setStep(stepNum);
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    
    try {
      const apiBase = boot?.apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
      
      // Send ALL form data including county information
      const response = await fetch(`${apiBase}/api/submit/community`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ 
          form: { 
            ...form, 
            phone: cleanPhoneNumber(form.phone),
            // Include all fields: state, county, city, population, etc.
          }, 
          referralToken: boot?.referralToken || null
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (data.ok && data.results) {
        // Store API results for display
        setApiResults(data.results);
        setSubmitted(true);
      } else {
        throw new Error(data.error || 'Invalid response from server');
      }
    } catch (error) {
      console.error('Submit error:', error);
      alert(`There was an error submitting your form: ${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div ref={rootRef} style={{ padding:16, maxWidth:720, margin:'0 auto', position:'relative' }}>
      {/* Dev Debug Panel */}
      <button 
        type="button"
        onClick={() => setShowDev(!showDev)}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          padding: '4px 8px',
          fontSize: '11px',
          background: '#666',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          zIndex: 1000
        }}
      >
        DEV
      </button>
      
      {showDev && (
        <div style={{
          position: 'absolute',
          top: 40,
          right: 16,
          background: '#fff',
          border: '2px solid #666',
          borderRadius: '8px',
          padding: '12px',
          fontSize: '11px',
          maxWidth: '400px',
          maxHeight: '400px',
          overflow: 'auto',
          zIndex: 1001,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
          <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>Debug Info</div>
          <div style={{ marginBottom: '12px' }}>
            <strong>Step:</strong> {step}/3
          </div>
          <div style={{ marginBottom: '12px' }}>
            <strong>Form State:</strong>
            <pre style={{ marginTop: '4px', fontSize: '10px', overflow: 'auto' }}>
              {JSON.stringify(form, null, 2)}
            </pre>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <strong>Config:</strong>
            <pre style={{ marginTop: '4px', fontSize: '10px', overflow: 'auto' }}>
              {JSON.stringify(cfg, null, 2)}
            </pre>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <strong>Boot:</strong>
            <pre style={{ marginTop: '4px', fontSize: '10px', overflow: 'auto' }}>
              {JSON.stringify(boot, null, 2)}
            </pre>
          </div>
          <div>
            <strong>Calculated:</strong>
            <div style={{ marginTop: '4px', fontSize: '10px' }}>
              Members: {members.toLocaleString()}<br/>
              With Rx: {withRx.toLocaleString()}<br/>
              With ORx: {withORx.toLocaleString()}<br/>
              At Risk: {atRisk.toLocaleString()}<br/>
              Prescribers: {prescribers.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      <h2>Return-on-Community</h2>
      
      {/* Step Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px', position: 'relative' }}>
        {[
          { num: 1, label: 'Plan Information', icon: MapPin },
          { num: 2, label: 'Contact Information', icon: User },
          { num: 3, label: 'Impact Report', icon: FileText }
        ].map(({ num, label, icon: Icon }, index) => {
          const isCompleted = completedSteps.includes(num);
          const isCurrent = step === num;
          const isClickable = isCompleted || num < step;
          const isLast = index === 2;
          
          return (
            <div key={num} style={{ display: 'flex', alignItems: 'center', flex: isLast ? '0 0 auto' : '1' }}>
              <div
                onClick={() => handleStepClick(num)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: isClickable ? 'pointer' : 'default',
                  opacity: isClickable ? 1 : 0.6,
                  position: 'relative',
                  zIndex: 2
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: isCompleted ? '#22c55e' : isCurrent ? '#111' : '#ddd',
                    color: isCompleted ? '#fff' : isCurrent ? '#fff' : '#666',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    border: isCurrent ? '2px solid #111' : 'none'
                  }}
                >
                  {isCompleted ? <Check size={24} /> : <Icon size={24} />}
                </div>
                <div style={{ fontSize: '12px', textAlign: 'center', fontWeight: isCurrent ? '600' : '400' }}>
                  {label}
                </div>
              </div>
              {!isLast && (
                <div
                  style={{
                    flex: 1,
                    height: '2px',
                    margin: '0 16px',
                    marginTop: '-24px',
                    background: completedSteps.includes(num) ? '#22c55e' : '#ddd',
                    transition: 'background 0.2s',
                    position: 'relative',
                    zIndex: 1
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1: Basic Information */}
      {step === 1 && (
        <div style={{ display:'grid', gap:16 }}>
          <div>
            <h3 style={{ marginBottom: '8px' }}>Plan Information</h3>
            <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
              Tell us about your community so we can generate a personalized impact analysis.
            </p>
          </div>
          <div>
            <span style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '8px', display: 'block' }}>Primary Location *</span>
            <div style={{ display: 'flex', gap: '12px' }}>
              <label style={{ flex: 1 }}>
                <span style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px', display: 'block' }}>City</span>
                <input 
                  value={form.city} 
                  onChange={e=>setForm({...form, city:e.target.value})}
                  placeholder="City"
                />
              </label>
              <label style={{ flex: 1 }}>
                <span style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px', display: 'block' }}>State *</span>
                <select
                  value={form.state} 
                  onChange={e=>{
                    const newState = e.target.value;
                    const apiBase = boot?.apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
                    console.log('State changed to:', newState, 'boot:', !!boot, 'apiBase:', apiBase);
                    setForm({...form, state:newState, county:''});
                  }}
                  required
                  style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '14px', width: '100%' }}
                >
                  <option value="">Select State</option>
                  {US_STATES.map(state => (
                    <option key={state.value} value={state.value}>{state.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ flex: 1 }}>
                <span style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '4px', display: 'block' }}>County *</span>
                <select
                  value={form.county} 
                  onChange={e=>setForm({...form, county:e.target.value})}
                  disabled={!form.state}
                  required
                  style={{ 
                    padding: '10px', 
                    border: '1px solid #ccc', 
                    borderRadius: '6px', 
                    fontSize: '14px', 
                    width: '100%',
                    opacity: form.state ? 1 : 0.6,
                    cursor: form.state ? 'pointer' : 'not-allowed'
                  }}
                >
                  <option value="">Select County</option>
                  {counties.map(county => (
                    <option key={county.value} value={county.value}>{county.label}</option>
                  ))}
                  {counties.length > 0 && <option value="County Not Listed">County Not Listed</option>}
                </select>
              </label>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
            <label style={{flex:1}}>
              <span>Population *</span>
              <input 
                type="number" 
                min={1} 
                value={form.population} 
                onChange={e=>setForm({...form, population:e.target.value})} 
                required
                placeholder="Auto-populated or enter manually"
              />
            </label>
            <button 
              type="button" 
              onClick={handleLookup}
              disabled={!form.state || !form.county || form.county === 'County Not Listed' || lookupLoading}
              style={{
                padding:'10px 14px',
                border:0,
                borderRadius:8,
                background:'#666',
                color:'white',
                cursor: (!form.state || !form.county || form.county === 'County Not Listed' || lookupLoading) ? 'not-allowed' : 'pointer',
                opacity: (!form.state || !form.county || form.county === 'County Not Listed' || lookupLoading) ? 0.5 : 1,
                whiteSpace: 'nowrap'
              }}
            >
              {lookupLoading ? '...' : 'Lookup'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Contact Information */}
      {step === 2 && (
        <div style={{ display:'grid', gap:16 }}>
          <div>
            <h3 style={{ marginBottom: '8px' }}>Contact Information</h3>
            <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
              Once we generate your report, we can email you a copy and schedule a follow-up discussion.
            </p>
          </div>
          <label>
            <span>First Name *</span>
            <input 
              value={form.firstName} 
              onChange={e=>setForm({...form, firstName:e.target.value})} 
              required
            />
          </label>
          <label>
            <span>Last Name *</span>
            <input 
              value={form.lastName} 
              onChange={e=>setForm({...form, lastName:e.target.value})} 
              required
            />
          </label>
          <label>
            <span>Email Address *</span>
            <input 
              type="email" 
              value={form.email} 
              onChange={e=>setForm({...form, email:e.target.value})} 
              required
            />
          </label>
          <label>
            <span>Phone</span>
            <input 
              type="tel"
              value={form.phone} 
              onChange={e=>handlePhoneChange(e.target.value)}
              placeholder="(123) 456-7890"
              maxLength={14}
            />
          </label>
          <label>
            <span>Company/Org</span>
            <input 
              value={form.company} 
              onChange={e=>setForm({...form, company:e.target.value})}
            />
          </label>
          <label>
            <span>Title</span>
            <input 
              value={form.title} 
              onChange={e=>setForm({...form, title:e.target.value})}
            />
          </label>
        </div>
      )}

      {/* Step 3: Results */}
      {step === 3 && (
        <div style={{ display:'grid', gap:16 }}>
          <div>
            <h3 style={{ marginBottom: '8px' }}>Impact Report</h3>
            <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
              Your personalized impact analysis shows the potential impact of opioid dependency risk factors within your community.
            </p>
          </div>
          {submitting && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div 
                className="spinner"
                style={{
                  width: '48px',
                  height: '48px',
                  margin: '0 auto 20px',
                  border: '4px solid #e0e0e0',
                  borderTop: '4px solid #22c55e',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite, pulse 2s ease-in-out infinite'
                }}
              />
              <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px' }}>
                Calculating your impact analysis report...
              </div>
              <div style={{ color: '#666', fontSize: '14px' }}>
                This will just take a moment
              </div>
            </div>
          )}
          {submitted && (
            <div style={{ background:'#e8f5e9', padding:16, borderRadius:8, marginBottom:16 }}>
              <h4 style={{ marginTop: 0, marginBottom: 0 }}>✓ Thank you! We will follow up soon.</h4>
            </div>
          )}
          {submitted && apiResults && (
            <>
              <div style={{ background:'#fafafa', padding:16, borderRadius:8 }}>
                <h4 style={{ marginTop: 0 }}>Estimated Outcomes</h4>
                <ul style={{ margin: '8px 0', paddingLeft: '24px' }}>
                  <li>Members: <b>{members.toLocaleString()}</b></li>
                  <li>Members with Rx: <b>{withRx.toLocaleString()}</b></li>
                  <li>Members with Opioid Rx (ORx): <b>{withORx.toLocaleString()}</b></li>
                  <li>Identified At-Risk Members: <b>{atRisk.toLocaleString()}</b></li>
                  <li>Prescribers Identified: <b>{prescribers.toLocaleString()}</b></li>
                </ul>
              </div>
              <div style={{ background:'#fff3cd', padding:16, borderRadius:8 }}>
                <p style={{ margin: 0, fontSize: '14px' }}>
                  Your results have been submitted. Our team will contact you shortly to discuss your community analysis.
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Navigation Buttons */}
      {step < 3 && (
        <div style={{ display:'flex', gap:12, marginTop:24, justifyContent: step === 1 ? 'flex-end' : 'space-between' }}>
          {step > 1 && (
            <button 
              type="button" 
              onClick={handleBack}
              style={{ 
                padding:'10px 20px', 
                border:'1px solid #ccc', 
                background:'transparent',
                borderRadius:8,
                cursor: 'pointer'
              }}
            >
              Back
            </button>
          )}
          <button 
            type="button" 
            onClick={handleNext}
            disabled={
              (step === 1 && !validateStep1()) || 
              (step === 2 && !validateStep2())
            }
            style={{ 
              padding:'10px 20px', 
              border:0, 
              borderRadius:8, 
              background:'#111', 
              color:'white',
              cursor: (
                (step === 1 && !validateStep1()) || 
                (step === 2 && !validateStep2())
              ) ? 'not-allowed' : 'pointer',
              opacity: (
                (step === 1 && !validateStep1()) || 
                (step === 2 && !validateStep2())
              ) ? 0.5 : 1
            }}
          >
            {step === 2 ? 'Submit' : 'Next'}
          </button>
        </div>
      )}

      <style jsx>{`
        label { display:flex; flex-direction:column; gap:4px; }
        label span { font-weight:500; font-size:14px; }
        input { padding:10px; border:1px solid #ccc; border-radius:6px; font-size:14px; }
        input:focus { outline:none; border-color:#111; }
        button { padding:10px 14px; border:0; border-radius:8px; background:#111; color:white; cursor:pointer; }
        [data-theme="dark"] button { background:#eee; color:#111; }
        [data-theme="dark"] input { background:#222; color:#eee; border-color:#444; }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { border-top-color: #22c55e; opacity: 1; }
          50% { border-top-color: #16a34a; opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
