'use client';
import { useEffect, useRef, useState } from 'react';
import { formatPhoneNumber, cleanPhoneNumber } from '../utils/inputMask';
import { MapPin, User, FileText, Check } from 'lucide-react';
import { US_STATES, getCountiesForState, getCountyRate, convertRateToOpioidRxRate } from '../utils/countyData';

// Force dynamic rendering to avoid hydration issues in iframe
export const dynamic = 'force-dynamic';
type Boot = { apiBase: string; configVersion: string; theme: 'light'|'dark'|string; referralToken: string|null; hubspotIntegration?: boolean; };
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
  const [counties, setCounties] = useState<Array<{ value: string; label: string }>>([]);
  const [countyRate, setCountyRate] = useState<number | null>(null);
  const [apiResults, setApiResults] = useState<any>(null);
  const [countyPopulation, setCountyPopulation] = useState<number | null>(null);
  const [populationFound, setPopulationFound] = useState(false);
  const [manualPopulationEntry, setManualPopulationEntry] = useState(false);
  
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

  // Load county rate and population when state and county change
  useEffect(() => {
    const apiBase = boot?.apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
    if (form.state && form.county) {
      if (form.county === 'County Not Listed') {
        // For "County Not Listed", show input field directly
        setCountyRate(null);
        setCountyPopulation(null);
        setPopulationFound(false);
        setManualPopulationEntry(true);
        // Don't clear population - let user enter it
      } else {
        // Load county rate
        getCountyRate(form.state, form.county, apiBase).then(rate => {
          setCountyRate(rate);
        });
        
        // Reset manual entry mode when county changes
        setManualPopulationEntry(false);
        
        // Auto-populate population from county data
        fetch(`${apiBase}/api/lookup/population?state=${encodeURIComponent(form.state)}&county=${encodeURIComponent(form.county)}`)
          .then(r => r.json())
          .then(data => {
            if (data?.population) {
              setCountyPopulation(data.population);
              setPopulationFound(true);
              // Only auto-populate if not in manual mode
              if (!manualPopulationEntry) {
                setForm(f => ({ ...f, population: String(data.population) }));
              }
            } else {
              setCountyPopulation(null);
              setPopulationFound(false);
              // If no data found, show input field
              setManualPopulationEntry(true);
            }
          })
          .catch(error => {
            console.error('Population lookup error:', error);
            setCountyPopulation(null);
            setPopulationFound(false);
            setManualPopulationEntry(true);
          });
      }
    } else {
      setCountyRate(null);
      setCountyPopulation(null);
      setPopulationFound(false);
      setManualPopulationEntry(false);
      // Clear population when county is cleared
      setForm(f => ({ ...f, population: '' }));
    }
  }, [form.state, form.county, boot]);

  // Use API results if available, otherwise calculate for preview (before submit)
  const pop = Number(form.population || 0);
  const members = apiResults?.members ?? pop;
  const withRx = apiResults?.withRx ?? (cfg ? Math.round(members * cfg.math.rx_rate) : 0);
  
  // Calculate residents with opioid Rx
  // If county ORx/100 rate is available, use it directly on population
  // Otherwise, use default: 20% of residents with Rx
  let withORx: number;
  let orxPer100: number;
  let usedCountyRate: boolean;
  
  if (apiResults?.withORx !== undefined) {
    // Use API results if available
    withORx = apiResults.withORx;
    orxPer100 = apiResults.orxPer100 ?? (apiResults.opioidRxRate ? apiResults.opioidRxRate * 100 : 10.0);
    usedCountyRate = apiResults.usedCountyRate ?? false;
  } else if (countyRate !== null && cfg) {
    // Use county-specific ORx/100 rate (per 100 population)
    orxPer100 = countyRate;
    const opioidRxRate = orxPer100 / 100; // Convert to decimal (e.g., 10.0 -> 0.10)
    withORx = Math.round(members * opioidRxRate);
    usedCountyRate = true;
  } else if (cfg) {
    // Default: 20% of residents with Rx
    const opioidRxRate = cfg.math.opioid_rx_rate; // 0.2 (20%)
    withORx = Math.round(withRx * opioidRxRate);
    // Calculate equivalent ORx/100 rate for display
    orxPer100 = members > 0 ? (withORx / members) * 100 : cfg.math.default_orx_per_100 || 10.0;
    usedCountyRate = false;
  } else {
    // Fallback
    withORx = 0;
    orxPer100 = 10.0;
    usedCountyRate = false;
  }
  
  const atRisk = apiResults?.atRisk ?? (cfg ? Math.round(withORx * cfg.math.at_risk_rate) : 0);
  
  // Calculate milestones: Year 2 (24% decrease) and Year 3 (35% decrease) in ORx/100 rate
  const year2OrxPer100 = apiResults?.year2OrxPer100 ?? (cfg ? orxPer100 * (1 - cfg.math.year2_decrease_rate) : orxPer100 * 0.76);
  const year3OrxPer100 = apiResults?.year3OrxPer100 ?? (cfg ? orxPer100 * (1 - cfg.math.year3_decrease_rate) : orxPer100 * 0.65);
  
  const year2OrxRate = year2OrxPer100 / 100;
  const year3OrxRate = year3OrxPer100 / 100;
  
  // Calculate people with ORx at each milestone
  const year2WithORx = Math.round(members * year2OrxRate);
  const year3WithORx = Math.round(members * year3OrxRate);
  
  // Calculate people potentially saved (decrease in ORx cases)
  const year2PeopleSaved = withORx - year2WithORx;
  const year3PeopleSaved = withORx - year3WithORx;
  
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
          referralToken: boot?.referralToken || null,
          hubspotIntegration: boot?.hubspotIntegration === true
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
      {cfg?.showDevBox && (
        <>
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
              ORx/100: {orxPer100.toFixed(1)} (usedCountyRate: {String(usedCountyRate)})<br/>
              With ORx: {withORx.toLocaleString()}<br/>
              At Risk: {atRisk.toLocaleString()}<br/>
              Prescribers: {prescribers.toLocaleString()}<br/>
              Year 2 ORx/100: {year2OrxPer100.toFixed(1)}<br/>
              Year 2 People Saved: {year2PeopleSaved.toLocaleString()}<br/>
              Year 3 ORx/100: {year3OrxPer100.toFixed(1)}<br/>
              Year 3 People Saved: {year3PeopleSaved.toLocaleString()}
            </div>
          </div>
        </div>
          )}
        </>
      )}

      <h2>Return-on-Community</h2>
      
      {/* Step Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px', position: 'relative' }}>
        {[
          { num: 1, label: 'Community', icon: MapPin },
          { num: 2, label: 'Contact Information', icon: User },
          { num: 3, label: 'Impact Estimate', icon: FileText }
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
            <h3 style={{ marginBottom: '12px', fontSize: '1.75rem', fontWeight: '700', marginTop: 0 }}>Community Information</h3>
            <p style={{ color: '#333', fontSize: '1rem', margin: 0, lineHeight: '1.5' }}>
              Tell us about your community so we can generate a personalized impact analysis.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <label>
              <span style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '8px', display: 'block' }}>Primary Business City</span>
              <input 
                value={form.city} 
                onChange={e=>setForm({...form, city:e.target.value})}
                placeholder="City"
                autoComplete="address-level2"
              />
            </label>
            <label>
              <span style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '8px', display: 'block' }}>Primary Business State *</span>
              <select
                value={form.state} 
                onChange={e=>{
                  const newState = e.target.value;
                  const apiBase = boot?.apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
                  console.log('State changed to:', newState, 'boot:', !!boot, 'apiBase:', apiBase);
                  setForm({...form, state:newState, county:''});
                }}
                required
                autoComplete="address-level1"
                style={{ padding: '12px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '1rem', fontFamily: 'Lato, sans-serif', width: '100%' }}
              >
                <option value="">Select State</option>
                {US_STATES.map(state => (
                  <option key={state.value} value={state.value}>{state.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '8px', display: 'block' }}>Primary Business County *</span>
              <select
                value={form.county} 
                onChange={e=>setForm({...form, county:e.target.value})}
                disabled={!form.state}
                required
                style={{ 
                  padding: '12px', 
                  border: '1px solid #ccc', 
                  borderRadius: '6px', 
                  fontSize: '1rem', 
                  fontFamily: 'Lato, sans-serif', 
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
          {/* Population Field - Only show when county is selected */}
          {form.county && (
            <div>
              <span style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '8px', display: 'block' }}>Population *</span>
              {form.county !== 'County Not Listed' && populationFound && !manualPopulationEntry ? (
                // Show population as text with "Enter Manually" button (only for valid counties with data)
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '1rem', color: '#333', flex: 1 }}>
                    Your county population: <strong>{countyPopulation?.toLocaleString()}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setManualPopulationEntry(true);
                      // Keep the population value in the form
                      if (countyPopulation) {
                        setForm(f => ({ ...f, population: String(countyPopulation) }));
                      }
                    }}
                    style={{
                      padding: '8px 16px',
                      border: '1px solid #ccc',
                      borderRadius: '6px',
                      background: 'transparent',
                      color: '#333',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      whiteSpace: 'nowrap',
                      fontFamily: 'Lato, sans-serif'
                    }}
                  >
                    Enter Manually
                  </button>
                </div>
              ) : (
                // Show input field (manual entry, no data found, or "County Not Listed")
                <input 
                  type="number" 
                  min={1} 
                  value={form.population} 
                  onChange={e=>setForm({...form, population:e.target.value})} 
                  required
                  placeholder={form.county === 'County Not Listed' ? "Enter county population" : (populationFound ? "Enter population manually" : "Enter county population")}
                  autoComplete="off"
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Contact Information */}
      {step === 2 && (
        <div style={{ display:'grid', gap:16 }}>
          <div>
            <h3 style={{ marginBottom: '12px', fontSize: '1.75rem', fontWeight: '700', marginTop: 0 }}>Contact Information</h3>
            <p style={{ color: '#333', fontSize: '1rem', margin: 0, lineHeight: '1.5' }}>
              Once we generate your report, we can email you a copy and schedule a follow-up discussion.
            </p>
          </div>
          <label>
            <span style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '8px' }}>First Name *</span>
            <input 
              value={form.firstName} 
              onChange={e=>setForm({...form, firstName:e.target.value})} 
              required
              autoComplete="given-name"
            />
          </label>
          <label>
            <span style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '8px' }}>Last Name *</span>
            <input 
              value={form.lastName} 
              onChange={e=>setForm({...form, lastName:e.target.value})} 
              required
              autoComplete="family-name"
            />
          </label>
          <label>
            <span style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '8px' }}>Email Address *</span>
            <input 
              type="email" 
              value={form.email} 
              onChange={e=>setForm({...form, email:e.target.value})} 
              required
              autoComplete="email"
            />
          </label>
          <label>
            <span style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '8px' }}>Phone</span>
            <input 
              type="tel"
              value={form.phone} 
              onChange={e=>handlePhoneChange(e.target.value)}
              placeholder="(123) 456-7890"
              maxLength={14}
              autoComplete="tel"
            />
          </label>
          <label>
            <span style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '8px' }}>Title</span>
            <input 
              value={form.title} 
              onChange={e=>setForm({...form, title:e.target.value})}
              autoComplete="organization-title"
            />
          </label>
        </div>
      )}

      {/* Step 3: Results */}
      {step === 3 && (
        <div style={{ display:'grid', gap:16 }}>
          <div>
            <h3 style={{ marginBottom: '12px', fontSize: '1.75rem', fontWeight: '700', marginTop: 0 }}>Impact Estimate</h3>
            <p style={{ color: '#333', fontSize: '1rem', margin: 0, lineHeight: '1.5' }}>
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
              <h4 style={{ marginTop: 0, marginBottom: 0 }}>✓ Thank you! Your results have been submitted. Our team will contact you shortly to discuss your impact analysis.</h4>
            </div>
          )}
          {submitted && apiResults && (
            <>
              {/* Centered OIE Image */}
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <img 
                  src="/images/OIE.png" 
                  alt="OIE" 
                  style={{ maxWidth: '100%', height: 'auto' }}
                />
              </div>

              {/* Results List - Matching Impact Form Format */}
              <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '32px' }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '16px 0',
                  borderBottom: '1px solid #e5e7eb'
                }}>
                  <div style={{ fontSize: '1.125rem', color: '#333', fontWeight: '700' }}>Total Population</div>
                  <div style={{ fontSize: '1.125rem', color: '#333', fontWeight: '400' }}>{members.toLocaleString()}</div>
                </div>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '16px 0',
                  borderBottom: '1px solid #e5e7eb'
                }}>
                  <div style={{ fontSize: '1.125rem', color: '#333', fontWeight: '700' }}>Residents with Opioid Rx</div>
                  <div style={{ fontSize: '1.125rem', color: '#333', fontWeight: '400' }}>{withORx.toLocaleString()}</div>
                </div>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '16px 0',
                  borderBottom: '1px solid #e5e7eb'
                }}>
                  <div style={{ fontSize: '1.125rem', color: '#333', fontWeight: '700' }}>At-Risk Residents</div>
                  <div style={{ fontSize: '1.125rem', color: '#333', fontWeight: '400' }}>{atRisk.toLocaleString()}</div>
                </div>
              </div>

              {/* Year 2 and Year 3 Milestones */}
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '16px', 
                marginTop: '32px',
                marginBottom: '32px',
                padding: '24px',
                background: '#f0f9ff',
                border: '2px solid #3b82f6',
                borderRadius: '8px'
              }}>
                <div style={{ fontSize: '1.25rem', color: '#333', fontWeight: '700', marginBottom: '16px' }}>
                  Projected Impact Milestones
                </div>
                
                <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #bfdbfe' }}>
                  <div style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '8px', color: '#1e40af' }}>
                    Year 2 Milestone: 24% Decrease
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#333' }}>
                    Potential Reduction: <strong style={{ color: '#1e40af' }}>{year2PeopleSaved.toLocaleString()}</strong> residents
                  </div>
                </div>
                
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '8px', color: '#1e40af' }}>
                    Year 3 Milestone: 35% Decrease
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#333' }}>
                    Potential Reduction: <strong style={{ color: '#1e40af' }}>{year3PeopleSaved.toLocaleString()}</strong> residents
                  </div>
                </div>
              </div>

              {/* OFA Button */}
              <div style={{ textAlign: 'center', marginTop: '32px' }}>
                <button
                  type="button"
                  onClick={() => {
                    // Add any button action here if needed
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  <img 
                    src="/images/OFA-dark.png" 
                    alt="OFA" 
                    style={{ maxWidth: '325px', height: 'auto' }}
                  />
                </button>
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
                background:'secondary',
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
        label { display:flex; flex-direction:column; }
        input { padding:12px; border:1px solid #ccc; border-radius:6px; font-size:1rem; font-family: Lato, sans-serif; }
        input:focus { outline:none; border-color:#111; }
        button { padding:10px 14px; border:0; border-radius:8px; background:#111; color:white; cursor:pointer; font-family: Lato, sans-serif; font-size:1rem; }
        [data-theme="dark"] button { background:#eee; color:#111; }
        [data-theme="dark"] input { background:#222; color:#eee; border-color:#444; }
        h3 { font-family: Lato, sans-serif; }
        p { font-family: Lato, sans-serif; }
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
