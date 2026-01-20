'use client';
import { useEffect, useRef, useState } from 'react';
import { formatPhoneNumber, cleanPhoneNumber, formatNumberWithCommas, cleanNumber } from '../utils/inputMask';
import { Building2, User, FileText, Check } from 'lucide-react';
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

// Content for each step in the Content View
const stepContent = {
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
    employees: '', 
    planMembers: '',
    company: '', 
    city: '', 
    state: '', 
    county: '', 
    firstName: '', 
    lastName: '', 
    email: '', 
    phone: '', 
    title: '' 
  });
  const [showPlanMembers, setShowPlanMembers] = useState(true);
  const [mounted, setMounted] = useState(false);
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
    const apiBase = boot?.apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
    if (!apiBase) return;
    console.log('Loading config from:', `${apiBase}/api/config?version=${encodeURIComponent(v)}&form=full-oia`);
    fetch(`${apiBase}/api/config?version=${encodeURIComponent(v)}&form=full-oia`)
      .then(r => r.json())
      .then(data => {
        console.log('Config loaded:', data);
        setCfg(data);
      })
      .catch(error => {
        console.error('Failed to load config:', error);
      });
  }, [boot, mounted]);

  // Load counties when state changes
  useEffect(() => {
    const apiBase = boot?.apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
    if (form.state) {
      getCountiesForState(form.state, apiBase)
        .then(counties => {
          setCounties(counties);
        })
        .catch(error => {
          console.error('Error loading counties:', error);
          setCounties([]);
        });
    } else {
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

  // Use API results if available, otherwise calculate for preview
  const employees = Number(cleanNumber(form.employees || '0'));
  const planMembersInput = Number(cleanNumber(form.planMembers || '0'));
  const members = apiResults?.members ?? (planMembersInput > 0 ? planMembersInput : (cfg ? Math.round(employees * cfg.math.avg_dependents_per_employee) : 0));
  const withRx = apiResults?.withRx ?? (cfg ? Math.round(members * cfg.math.rx_rate) : 0);
  const opioidRxRate = apiResults?.opioidRxRate ?? (countyRate !== null ? convertRateToOpioidRxRate(countyRate) : (cfg ? cfg.math.opioid_rx_rate : 0.2));
  const withORx = apiResults?.withORx ?? (cfg ? Math.round(withRx * opioidRxRate) : 0);
  const atRisk = apiResults?.atRisk ?? (cfg ? Math.round(withORx * cfg.math.at_risk_rate) : 0);
  const prescribers = apiResults?.prescribers ?? (cfg ? Math.round(atRisk * cfg.math.prescriber_non_cdc_rate) : 0);

  // Financial calculations
  const costPerMemberORx = apiResults?.costPerMemberORx ?? 7500;
  const netCostPerMemberORx = apiResults?.netCostPerMemberORx ?? 4000;
  const avgCareManagedCost = apiResults?.avgCareManagedCost ?? 4500;
  const savingsPerMember = apiResults?.savingsPerMember ?? (costPerMemberORx - avgCareManagedCost);
  const financialImpact = apiResults?.financialImpact ?? (withORx * netCostPerMemberORx);
  const targetedSavings = apiResults?.targetedSavings ?? (withORx * savingsPerMember);
  const targetedSavingsPercent = apiResults?.targetedSavingsPercent ?? (financialImpact > 0 ? Math.round((targetedSavings / financialImpact) * 100) : 0);

  // Auto-submit when reaching step 3
  const submittedForStep3Ref = useRef(false);
  useEffect(() => {
    if (step === 3 && !submitting && !submitted && !submittedForStep3Ref.current) {
      console.log('Step 3 reached, triggering handleSubmit');
      submittedForStep3Ref.current = true;
      handleSubmit();
    }
    if (step !== 3) {
      submittedForStep3Ref.current = false;
    }
  }, [step, submitting, submitted]);

  // Step validation
  const validateStep1 = () => {
    const employeesCleaned = cleanNumber(form.employees || '');
    const planMembersCleaned = cleanNumber(form.planMembers || '');
    const hasEmployees = employeesCleaned && Number(employeesCleaned) > 0;
    const hasPlanMembers = planMembersCleaned && Number(planMembersCleaned) > 0;
    const hasRequiredField = showPlanMembers ? hasPlanMembers : hasEmployees;
    return hasRequiredField && form.company.trim() !== '';
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

  const handleEmployeesChange = (value: string) => {
    const formatted = formatNumberWithCommas(value);
    setForm({...form, employees: formatted});
  };

  const handlePlanMembersChange = (value: string) => {
    const formatted = formatNumberWithCommas(value);
    setForm({...form, planMembers: formatted});
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

  const fillFakeData = () => {
    setForm({
      employees: '',
      planMembers: formatNumberWithCommas('25000'),
      company: 'Palm Beach Employee Health Plan',
      city: 'Palm Beach',
      state: 'FL',
      county: 'Palm Beach County',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      phone: '(555) 123-4567',
      title: 'Director of Benefits'
    });
    setShowPlanMembers(true);
    setCompletedSteps([1, 2]);
  };

  const jumpToStep = (stepNum: number) => {
    setStep(stepNum);
    if (stepNum === 1) {
      setCompletedSteps([]);
    } else if (stepNum === 2) {
      fillFakeData();
      setCompletedSteps([1]);
    } else if (stepNum === 3) {
      fillFakeData();
      setCompletedSteps([1, 2]);
      setSubmitted(false);
      setSubmitting(false);
      const trySubmit = () => {
        if (cfg) {
          console.log('Calling handleSubmit from jumpToStep');
          handleSubmit();
        } else {
          console.log('Waiting for cfg to load before submitting...');
          setTimeout(trySubmit, 100);
        }
      };
      setTimeout(trySubmit, 100);
    }
  };

  const handleSubmit = async () => {
    if (submitting) {
      console.log('handleSubmit blocked: already submitting');
      return;
    }
    
    const apiBase = boot?.apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
    console.log('handleSubmit called with:', { apiBase, submitting });
    
    setSubmitting(true);
    
    try {
      const response = await fetch(`${apiBase}/api/submit/full-oia`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ 
          form: { 
            ...form, 
            phone: cleanPhoneNumber(form.phone), 
            employees: cleanNumber(form.employees),
            planMembers: cleanNumber(form.planMembers),
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

  const currentContent = stepContent[step as keyof typeof stepContent];

  return (
    <div ref={rootRef} style={{ padding: 16, maxWidth: 1200, margin: '0 auto', position: 'relative' }}>
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
              <div style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid #ddd' }}>
                <div style={{ marginBottom: '6px', fontWeight: '600', fontSize: '10px', textTransform: 'uppercase' }}>Show Me:</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button onClick={() => jumpToStep(1)} style={{ padding: '4px 8px', fontSize: '10px', border: '1px solid #666', background: step === 1 ? '#22c55e' : '#fff', color: step === 1 ? '#fff' : '#333', borderRadius: '4px', cursor: 'pointer' }}>Step 1</button>
                  <button onClick={() => jumpToStep(2)} style={{ padding: '4px 8px', fontSize: '10px', border: '1px solid #666', background: step === 2 ? '#22c55e' : '#fff', color: step === 2 ? '#fff' : '#333', borderRadius: '4px', cursor: 'pointer' }}>Step 2</button>
                  <button onClick={() => jumpToStep(3)} style={{ padding: '4px 8px', fontSize: '10px', border: '1px solid #666', background: step === 3 ? '#22c55e' : '#fff', color: step === 3 ? '#fff' : '#333', borderRadius: '4px', cursor: 'pointer' }}>Results</button>
                </div>
                <button onClick={fillFakeData} style={{ marginTop: '6px', padding: '4px 8px', fontSize: '10px', border: '1px solid #666', background: '#fff', color: '#333', borderRadius: '4px', cursor: 'pointer', width: '100%' }}>Fill Form</button>
              </div>
              <div style={{ marginBottom: '12px' }}><strong>Step:</strong> {step}/3</div>
              <div style={{ marginBottom: '12px' }}><strong>Form State:</strong><pre style={{ marginTop: '4px', fontSize: '10px', overflow: 'auto' }}>{JSON.stringify(form, null, 2)}</pre></div>
            </div>
          )}
        </>
      )}

      {/* <h2 style={{ marginBottom: '32px', fontSize: '2rem', fontWeight: '700' }}>Opioid Impact Estimate</h2> */}
      
      {/* Step Indicator - On its own row above the grid */}
      <div className="step-indicator" style={{ 
        display: 'flex', 
        alignItems: 'center', 
        marginBottom: '32px',
        paddingTop: '16px',
        paddingBottom: '16px'
      }}>
            {[
              { num: 1, label: 'Plan Information', icon: Building2 },
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

      {/* 2-Column Layout */}
      <div className="two-column-layout" style={{ 
        alignItems: 'start'
      }}>
        {/* Left Column: Content View */}
        <div className="content-view" style={{ 
          padding: step === 1 ? '0' : '24px',
          background: step === 1 ? 'transparent' : '#f9fafb',
          borderRadius: '8px',
          minHeight: step === 1 ? 'auto' : '400px'
        }}>
          {step === 1 ? (
            <img 
              src="/images/SchoolDistrictCaseStudy.jpg" 
              alt="School District Case Study"
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                borderRadius: '8px'
              }}
            />
          ) : step === 2 ? (
            <>
              <h3 style={{ 
                fontSize: '1.5rem', 
                fontWeight: '700', 
                marginBottom: '16px',
                marginTop: 0
              }}>
                {currentContent.title}
              </h3>
              <p style={{ 
                color: '#333', 
                fontSize: '1rem', 
                marginBottom: '24px',
                lineHeight: '1.6'
              }}>
                {('description' in currentContent ? currentContent.description : '') || ('subheading' in currentContent ? currentContent.subheading : '')}
              </p>
              <div style={{ marginTop: '24px' }}>
                <strong style={{ 
                  fontSize: '1rem',
                  fontWeight: '700',
                  color: '#333',
                  display: 'block',
                  marginBottom: '12px'
                }}>
                  {'exampleLabel' in currentContent ? currentContent.exampleLabel : ''}
                </strong>
                <img 
                  src="/images/ExampleResult.png" 
                  alt="Example Result"
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                    borderRadius: '8px'
                  }}
                />
              </div>
            </>
          ) : step === 3 ? (
            <>
              <h3 style={{ 
                fontSize: '1.5rem', 
                fontWeight: '700', 
                marginBottom: '16px',
                marginTop: 0,
                whiteSpace: 'pre-line'
              }}>
                {currentContent.title}
              </h3>
              {'subheading' in currentContent && (
                <p style={{ 
                  color: '#333', 
                  fontSize: '1rem', 
                  marginBottom: '24px',
                  lineHeight: '1.6'
                }}>
                  {currentContent.subheading}
                </p>
              )}
              <ul style={{ 
                listStyle: 'none', 
                padding: 0, 
                margin: '0 0 24px 0'
              }}>
                {'bullets' in currentContent && currentContent.bullets.map((bullet: string, idx: number) => (
                  <li key={idx} style={{ 
                    marginBottom: '12px',
                    fontSize: '1rem',
                    lineHeight: '1.5',
                    color: '#333'
                  }}>
                    {bullet}
                  </li>
                ))}
              </ul>
              {'subheading2' in currentContent && (
                <p style={{ 
                  color: '#333', 
                  fontSize: '1rem', 
                  marginBottom: 0,
                  lineHeight: '1.6'
                }}>
                  {currentContent.subheading2}
                </p>
              )}
            </>
          ) : (
            <>
              <h3 style={{ 
                fontSize: '1.5rem', 
                fontWeight: '700', 
                marginBottom: '16px',
                marginTop: 0
              }}>
                {currentContent.title}
              </h3>
              {'description' in currentContent && (
                <p style={{ 
                  color: '#333', 
                  fontSize: '1rem', 
                  marginBottom: '24px',
                  lineHeight: '1.6'
                }}>
                  {currentContent.description}
                </p>
              )}
              <ul style={{ 
                listStyle: 'none', 
                padding: 0, 
                margin: 0 
              }}>
                {'bullets' in currentContent && currentContent.bullets.map((bullet: string, idx: number) => (
                  <li key={idx} style={{ 
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px'
                  }}>
                    <span style={{ 
                      color: '#22c55e',
                      fontSize: '1.25rem',
                      lineHeight: '1.5',
                      marginTop: '2px'
                    }}>✓</span>
                    <span style={{ 
                      fontSize: '1rem',
                      lineHeight: '1.5',
                      color: '#333'
                    }}>{bullet}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Right Column: Form View */}
        <div className="form-view" style={{ 
          position: 'relative'
        }}>
          {/* Step 1: Basic Information */}
          {step === 1 && (
            <div style={{ display:'grid', gap:16 }}>
              <div>
                <h3 style={{ marginBottom: '12px', fontSize: '1.75rem', fontWeight: '700', marginTop: 0 }}>Plan Information</h3>
                <p style={{ color: '#333', fontSize: '1rem', margin: 0, lineHeight: '1.5' }}>
                  Tell us about your health plan so we can generate a personalized impact analysis.
                </p>
              </div>
              
              <label>
                <span style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '8px' }}>Number of Plan Members *</span>
                <input 
                  type="text" 
                  inputMode="numeric"
                  value={form.planMembers} 
                  onChange={e=>handlePlanMembersChange(e.target.value)} 
                  placeholder="e.g., 25,000"
                  autoComplete="off"
                />
              </label>
              <label>
                <span style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '8px' }}>Business/Organization Name *</span>
                <input 
                  value={form.company} 
                  onChange={e=>setForm({...form, company:e.target.value})} 
                  required
                  autoComplete="organization"
                />
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <label>
                  <span style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '8px', display: 'block' }}>Primary Business City</span>
                  <input 
                    value={form.city} 
                    onChange={e=>setForm({...form, city:e.target.value})}
                    placeholder="City"
                    autoComplete="address-level2"
                  />
                </label>
                <label>
                  <span style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '8px', display: 'block' }}>Primary Business State</span>
                  <select
                    value={form.state} 
                    onChange={e=>{
                      const newState = e.target.value;
                      setForm({...form, state:newState, county:''});
                    }}
                    autoComplete="address-level1"
                    style={{ padding: '9.6px', border: '1px solid #ccc', borderRadius: '4.8px', fontSize: '0.8rem', fontFamily: 'Lato, sans-serif', width: '100%' }}
                  >
                    <option value="">Select State</option>
                    {US_STATES.map(state => (
                      <option key={state.value} value={state.value}>{state.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '8px', display: 'block' }}>Primary Business County</span>
                  <select
                    value={form.county} 
                    onChange={e=>setForm({...form, county:e.target.value})}
                    disabled={!form.state}
                    style={{ 
                      padding: '9.6px', 
                      border: '1px solid #ccc', 
                      borderRadius: '4.8px', 
                      fontSize: '0.8rem', 
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
                <span style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '8px' }}>First Name *</span>
                <input 
                  value={form.firstName} 
                  onChange={e=>setForm({...form, firstName:e.target.value})} 
                  required
                  autoComplete="given-name"
                />
              </label>
              <label>
                <span style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '8px' }}>Last Name *</span>
                <input 
                  value={form.lastName} 
                  onChange={e=>setForm({...form, lastName:e.target.value})} 
                  required
                  autoComplete="family-name"
                />
              </label>
              <label>
                <span style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '8px' }}>Email Address *</span>
                <input 
                  type="email" 
                  value={form.email} 
                  onChange={e=>setForm({...form, email:e.target.value})} 
                  required
                  autoComplete="email"
                />
              </label>
              <label>
                <span style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '8px' }}>Phone</span>
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
                <span style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '8px' }}>Title</span>
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
              {submitted && apiResults && (
                <>
                  <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <img 
                      src="/images/OIE.png" 
                      alt="OIE" 
                      style={{ maxWidth: '400px', height: 'auto' }}
                    />
                  </div>

                  <h2 style={{ 
                    color: '#333', 
                    fontSize: '1.25rem', 
                    marginBottom: '24px',
                    lineHeight: '1.6',
                    fontWeight: '600'
                  }}>
                    What preventable overprescribing is costing your health plan – right now:
                  </h2>

                  <div>
                    <h3 style={{ 
                      fontSize: '1.25rem', 
                      fontWeight: '700', 
                      marginBottom: '8px',
                      marginTop: 0
                    }}>
                      Estimated Annual Cost ${financialImpact.toLocaleString()}
                    </h3>
                    <h3 style={{ 
                      fontSize: '1.25rem', 
                      fontWeight: '700', 
                      marginBottom: 0,
                      marginTop: '16px'
                    }}>
                      Members at Elevated Risk: {atRisk.toLocaleString()}
                    </h3>
                  </div>

                  <p style={{ 
                    color: '#333', 
                    fontSize: '1rem', 
                    // marginBottom: '8px',
                    lineHeight: '1.6'
                  }}>
                    Using a prevention-first strategy, Opioid Free America estimates this amount of recoverable spend – strengthening your plan while protecting lives:
                  </p>

                  <h3 style={{ 
                    fontSize: '2rem', 
                    fontWeight: '700', 
                    marginBottom: '16px',
                    marginTop: 0,
                    color: '#3b82f6'
                  }}>
                    ${targetedSavings.toLocaleString()}
                  </h3>

                  <hr style={{ 
                    border: 'none',
                    borderTop: '1px solid #cecece',
                    width: '100%',
                    // margin: '16px 0'
                  }} />

                  <p style={{ 
                    color: '#333', 
                    fontSize: '1rem', 
                    // marginBottom: '16px',
                    lineHeight: '1.6'
                  }}>
                    How your County compares to the national average
                  </p>

                  <div style={{ 
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '16px',
                    // marginBottom: '32px',
                    padding: '16px',
                    background: '#f9fafb',
                    borderRadius: '8px'
                  }}>
                    <div>
                      <div style={{ 
                        fontSize: '0.875rem',
                        color: '#666',
                        marginBottom: '8px',
                        fontWeight: '600'
                      }}>
                        National Average
                      </div>
                      <div style={{ 
                        fontSize: '1.125rem',
                        color: '#333',
                        fontWeight: '700'
                      }}>
                        {((cfg?.math.opioid_rx_rate ?? 0.2) * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div style={{ 
                        fontSize: '0.875rem',
                        color: '#666',
                        marginBottom: '8px',
                        fontWeight: '600'
                      }}>
                        Your County
                      </div>
                      <div style={{ 
                        fontSize: '1.125rem',
                        color: '#333',
                        fontWeight: '700'
                      }}>
                        {countyRate !== null 
                          ? `${countyRate.toFixed(1)}%` 
                          : `${((cfg?.math.opioid_rx_rate ?? 0.2) * 100).toFixed(1)}%`}
                      </div>
                    </div>
                  </div>

                  <p style={{ 
                    color: '#333', 
                    fontSize: '1rem', 
                    // marginBottom: '24px',
                    lineHeight: '1.6'
                  }}>
                    Please check your inbox – your detailed Opioid Impact Estimate has just been emailed to you along with proven case studies. The report includes expanded analysis and our "Return on Community" (ROC) framework, which outlines the broader financial and community impact by partnering with Opioid Free America.
                  </p>

                  <p style={{ 
                    color: '#666', 
                    fontSize: '0.75rem', 
                    marginBottom: 0,
                    lineHeight: '1.5',
                    fontStyle: 'italic'
                  }}>
                    ** Opioid Free America offers a no risk guarantee. Details about our program will be emailed to you shortly with a more detailed estimate.
                  </p>
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
                    cursor: 'pointer',
                    color: '#333',
                    fontWeight: '600'
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
        </div>
      </div>

      <style jsx>{`
        label { display:flex; flex-direction:column; }
        input { padding:9.6px; border:1px solid #ccc; border-radius:4.8px; font-size:0.8rem; font-family: Lato, sans-serif; }
        input:focus { outline:none; border-color:#111; }
        select { padding:9.6px; border:1px solid #ccc; border-radius:4.8px; font-size:0.8rem; font-family: Lato, sans-serif; }
        select:focus { outline:none; border-color:#111; }
        button { padding:10px 14px; border:0; border-radius:8px; background:#111; color:white; cursor:pointer; font-family: Lato, sans-serif; font-size:1rem; }
        [data-theme="dark"] button { background:#eee; color:#111; }
        [data-theme="dark"] input { background:#222; color:#eee; border-color:#444; }
        [data-theme="dark"] select { background:#222; color:#eee; border-color:#444; }
        h3 { font-family: Lato, sans-serif; }
        p { font-family: Lato, sans-serif; }
        
        /* Responsive layout */
        .two-column-layout {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
        }
        
        /* Tablet: Content view wider (60/40) */
        @media (max-width: 1024px) {
          .two-column-layout {
            grid-template-columns: 1.5fr 1fr;
          }
        }
        
        /* Mobile: Stack vertically */
        @media (max-width: 768px) {
          .two-column-layout {
            grid-template-columns: 1fr;
            gap: 24px;
          }
        }
        
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
