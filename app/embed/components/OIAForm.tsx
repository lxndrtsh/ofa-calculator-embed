'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatPhoneNumber, cleanPhoneNumber, formatNumberWithCommas, cleanNumber } from '../utils/inputMask';
import { Building2, User, FileText, Check } from 'lucide-react';
import { US_STATES, getCountiesForState, getCountyRate, convertRateToOpioidRxRate } from '../utils/countyData';

type Boot = { apiBase: string; configVersion: string; theme: 'light'|'dark'|string; referralToken: string|null; hubspotIntegration?: boolean };

function postToParent(msg: unknown) { window.parent.postMessage(msg, '*'); }

function useBoot(): Boot | null {
  const [boot, setBoot] = useState<Boot | null>(null);
  useEffect(() => {
    function onMsg(ev: MessageEvent) { if (ev.data?.type === 'OFA_CALCULATOR_BOOT') setBoot(ev.data.payload as Boot); }
    window.addEventListener('message', onMsg);
    postToParent({ type: 'OFA_CALCULATOR_READY' });
    return () => window.removeEventListener('message', onMsg);
  }, []);
  return boot;
}

export type OIAFormProps = {
  /** Called when step changes so parent can sync content (e.g. full-oia left column) */
  onStepChange?: (step: number) => void;
};

export function OIAForm({ onStepChange }: OIAFormProps) {
  const boot = useBoot();
  const [cfg, setCfg] = useState<Record<string, unknown> | null>(null);
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
  const [mounted, setMounted] = useState(false);
  const [counties, setCounties] = useState<Array<{ value: string; label: string }>>([]);
  const [countyRate, setCountyRate] = useState<number | null>(null);
  const [apiResults, setApiResults] = useState<Record<string, unknown> | null>(null);
  const submittedForStep3Ref = useRef(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return;
    const search = new URLSearchParams(window.location.search);
    const v = search.get('v') || process.env.NEXT_PUBLIC_CONFIG_VERSION || 'dev';
    const theme = search.get('theme') || process.env.NEXT_PUBLIC_IFRAME_THEME || 'light';
    if (document.body) document.body.dataset.theme = theme;
    const apiBase = boot?.apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
    if (!apiBase) return;
    fetch(`${apiBase}/api/config?version=${encodeURIComponent(v)}&form=full-oia`)
      .then(r => r.json())
      .then(setCfg)
      .catch(console.error);
  }, [boot, mounted]);

  useEffect(() => {
    const apiBase = boot?.apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
    if (form.state) {
      getCountiesForState(form.state, apiBase)
        .then(setCounties)
        .catch(() => setCounties([]));
    } else {
      setCounties([]);
      setForm(f => ({ ...f, county: '' }));
    }
  }, [form.state, boot]);

  useEffect(() => {
    const apiBase = boot?.apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
    if (form.state && form.county) {
      getCountyRate(form.state, form.county, apiBase).then(setCountyRate);
    } else {
      setCountyRate(null);
    }
  }, [form.state, form.county, boot]);

  const employees = Number(cleanNumber(form.employees || '0'));
  const planMembersInput = Number(cleanNumber(form.planMembers || '0'));
  const math = cfg?.math as Record<string, number> | undefined;
  const members = (apiResults?.members as number) ?? (planMembersInput > 0 ? planMembersInput : (math ? Math.round(employees * (math.avg_dependents_per_employee ?? 2.5)) : 0));
  const withRx = (apiResults?.withRx as number) ?? (math ? Math.round(members * (math.rx_rate ?? 0.5)) : 0);
  const opioidRxRate = (apiResults?.opioidRxRate as number) ?? (countyRate !== null ? convertRateToOpioidRxRate(countyRate) : (math?.opioid_rx_rate ?? 0.2)) ?? 0.2;
  const withORx = (apiResults?.withORx as number) ?? (math ? Math.round(withRx * opioidRxRate) : 0);
  const atRisk = (apiResults?.atRisk as number) ?? (math ? Math.round(withORx * (math.at_risk_rate ?? 0.3)) : 0);
  const prescribers = (apiResults?.prescribers as number) ?? (math ? Math.round(atRisk * (math.prescriber_non_cdc_rate ?? 0.9)) : 0);

  const costPerMemberORx = (apiResults?.costPerMemberORx as number) ?? 7500;
  const netCostPerMemberORx = (apiResults?.netCostPerMemberORx as number) ?? 4000;
  const avgCareManagedCost = (apiResults?.avgCareManagedCost as number) ?? 4500;
  const savingsPerMember = costPerMemberORx - avgCareManagedCost;
  const financialImpact = (apiResults?.financialImpact as number) ?? withORx * netCostPerMemberORx;
  const targetedSavings = (apiResults?.targetedSavings as number) ?? withORx * savingsPerMember;

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    const apiBase = boot?.apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
    setSubmitting(true);
    try {
      const response = await fetch(`${apiBase}/api/submit/full-oia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form: {
            ...form,
            phone: cleanPhoneNumber(form.phone),
            employees: cleanNumber(form.employees),
            planMembers: cleanNumber(form.planMembers)
          },
          referralToken: boot?.referralToken ?? null,
          hubspotIntegration: boot?.hubspotIntegration === true
        })
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      if (data.ok && data.results) {
        setApiResults(data.results);
        setSubmitted(true);
      } else throw new Error(data.error || 'Invalid response');
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Please try again.'}`);
    } finally {
      setSubmitting(false);
    }
  }, [boot, form, submitting]);

  useEffect(() => {
    if (step === 3 && !submitting && !submitted && !submittedForStep3Ref.current) {
      submittedForStep3Ref.current = true;
      handleSubmit();
    }
    if (step !== 3) submittedForStep3Ref.current = false;
  }, [step, submitting, submitted, handleSubmit]);

  const validateStep1 = () => {
    const planMembersCleaned = cleanNumber(form.planMembers || '');
    const hasPlanMembers = planMembersCleaned && Number(planMembersCleaned) > 0;
    return hasPlanMembers && form.company.trim() !== '';
  };

  const validateStep2 = () =>
    form.firstName.trim() !== '' &&
    form.lastName.trim() !== '' &&
    form.email.trim() !== '' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);

  const handlePhoneChange = (value: string) => setForm(f => ({ ...f, phone: formatPhoneNumber(value) }));
  const handlePlanMembersChange = (value: string) => setForm(f => ({ ...f, planMembers: formatNumberWithCommas(value) }));

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

  const handleBack = () => { if (step > 1) setStep(step - 1); };

  const handleStepClick = (stepNum: number) => {
    if (completedSteps.includes(stepNum) || stepNum < step) setStep(stepNum);
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
    setCompletedSteps([1, 2]);
  };

  const jumpToStep = (stepNum: number) => {
    setStep(stepNum);
    if (stepNum === 1) setCompletedSteps([]);
    else if (stepNum === 2) {
      fillFakeData();
      setCompletedSteps([1]);
    } else if (stepNum === 3) {
      fillFakeData();
      setCompletedSteps([1, 2]);
      setSubmitted(false);
      setSubmitting(false);
      const trySubmit = () => {
        if (cfg) handleSubmit();
        else setTimeout(trySubmit, 100);
      };
      setTimeout(trySubmit, 100);
    }
  };

  const showDevBox = (cfg as { showDevBox?: boolean })?.showDevBox;

  return (
    <div className="form-view" style={{ position: 'relative' }}>
      {showDevBox && (
        <>
          <button
            type="button"
            onClick={() => setShowDev(!showDev)}
            style={{
              position: 'absolute', top: 0, right: 0,
              padding: '4px 8px', fontSize: '11px', background: '#666', color: 'white',
              border: 'none', borderRadius: '4px', cursor: 'pointer', zIndex: 1000
            }}
          >
            DEV
          </button>
          {showDev && (
            <div style={{
              position: 'absolute', top: 24, right: 0,
              background: '#fff', border: '2px solid #666', borderRadius: '8px', padding: '12px',
              fontSize: '11px', maxWidth: '400px', maxHeight: '400px', overflow: 'auto',
              zIndex: 1001, boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}>
              <div style={{ marginBottom: 8, fontWeight: 'bold' }}>Debug Info</div>
              <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #ddd' }}>
                <div style={{ marginBottom: 6, fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }}>Show Me:</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => jumpToStep(1)} style={{ padding: '4px 8px', fontSize: 10, border: '1px solid #666', background: step === 1 ? '#22c55e' : '#fff', color: step === 1 ? '#fff' : '#333', borderRadius: 4, cursor: 'pointer' }}>Step 1</button>
                  <button onClick={() => jumpToStep(2)} style={{ padding: '4px 8px', fontSize: 10, border: '1px solid #666', background: step === 2 ? '#22c55e' : '#fff', color: step === 2 ? '#fff' : '#333', borderRadius: 4, cursor: 'pointer' }}>Step 2</button>
                  <button onClick={() => jumpToStep(3)} style={{ padding: '4px 8px', fontSize: 10, border: '1px solid #666', background: step === 3 ? '#22c55e' : '#fff', color: step === 3 ? '#fff' : '#333', borderRadius: 4, cursor: 'pointer' }}>Results</button>
                </div>
                <button onClick={fillFakeData} style={{ marginTop: 6, padding: '4px 8px', fontSize: 10, border: '1px solid #666', background: '#fff', borderRadius: 4, cursor: 'pointer', width: '100%' }}>Fill Form</button>
              </div>
              <div style={{ marginBottom: 12 }}><strong>Step:</strong> {step}/3</div>
              <div style={{ marginBottom: 12 }}><strong>Form State:</strong><pre style={{ marginTop: 4, fontSize: 10, overflow: 'auto' }}>{JSON.stringify(form, null, 2)}</pre></div>
            </div>
          )}
        </>
      )}

      <div className="step-indicator" style={{ display: 'flex', alignItems: 'center', marginBottom: 24, paddingBottom: 16 }}>
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
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: isClickable ? 'pointer' : 'default', opacity: isClickable ? 1 : 0.6, position: 'relative', zIndex: 2 }}
              >
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: isCompleted ? '#22c55e' : isCurrent ? '#111' : '#ddd',
                  color: isCompleted ? '#fff' : isCurrent ? '#fff' : '#666',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', border: isCurrent ? '2px solid #111' : 'none'
                }}>
                  {isCompleted ? <Check size={24} /> : <Icon size={24} />}
                </div>
                <div style={{ fontSize: 12, textAlign: 'center', fontWeight: isCurrent ? 600 : 400 }}>{label}</div>
              </div>
              {!isLast && (
                <div style={{ flex: 1, height: 2, margin: '0 16px', marginTop: -24, background: completedSteps.includes(num) ? '#22c55e' : '#ddd', position: 'relative', zIndex: 1 }} />
              )}
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <h3 style={{ marginBottom: 12, fontSize: '1.75rem', fontWeight: 700, marginTop: 0 }}>Plan Information</h3>
            <p style={{ color: '#333', fontSize: '1rem', margin: 0, lineHeight: 1.5 }}>Tell us about your health plan so we can generate a personalized impact analysis.</p>
          </div>
          <label>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 8 }}>Number of Plan Members *</span>
            <input type="text" inputMode="numeric" value={form.planMembers} onChange={e => handlePlanMembersChange(e.target.value)} placeholder="e.g., 25,000" autoComplete="off" />
          </label>
          <label>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 8 }}>Business/Organization Name *</span>
            <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} required autoComplete="organization" />
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 8, display: 'block' }}>Primary Business City</span>
              <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="City" autoComplete="address-level2" />
            </label>
            <label>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 8, display: 'block' }}>Primary Business State</span>
              <select value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value, county: '' }))} autoComplete="address-level1" style={{ padding: '9.6px', border: '1px solid #ccc', borderRadius: '4.8px', fontSize: '0.8rem', fontFamily: 'Lato,sans-serif', width: '100%' }}>
                <option value="">Select State</option>
                {US_STATES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 8, display: 'block' }}>Primary Business County</span>
              <select value={form.county} onChange={e => setForm(f => ({ ...f, county: e.target.value }))} disabled={!form.state} style={{ padding: '9.6px', border: '1px solid #ccc', borderRadius: '4.8px', fontSize: '0.8rem', fontFamily: 'Lato,sans-serif', width: '100%', opacity: form.state ? 1 : 0.6, cursor: form.state ? 'pointer' : 'not-allowed' }}>
                <option value="">Select County</option>
                {counties.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                {counties.length > 0 && <option value="County Not Listed">County Not Listed</option>}
              </select>
            </label>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <h3 style={{ marginBottom: 12, fontSize: '1.75rem', fontWeight: 700, marginTop: 0 }}>Contact Information</h3>
            <p style={{ color: '#333', fontSize: '1rem', margin: 0, lineHeight: 1.5 }}>Once we generate your report, we can email you a copy and schedule a follow-up discussion.</p>
          </div>
          <label>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 8 }}>First Name *</span>
            <input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} required autoComplete="given-name" />
          </label>
          <label>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 8 }}>Last Name *</span>
            <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} required autoComplete="family-name" />
          </label>
          <label>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 8 }}>Email Address *</span>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required autoComplete="email" />
          </label>
          <label>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 8 }}>Phone</span>
            <input type="tel" value={form.phone} onChange={e => handlePhoneChange(e.target.value)} placeholder="(123) 456-7890" maxLength={14} autoComplete="tel" />
          </label>
          <label>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 8 }}>Title</span>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoComplete="organization-title" />
          </label>
        </div>
      )}

      {step === 3 && (
        <div style={{ display: 'grid', gap: 16 }}>
          {submitting && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div className="spinner" style={{ width: 48, height: 48, margin: '0 auto 20px', border: '4px solid #e0e0e0', borderTop: '4px solid #22c55e', borderRadius: '50%', animation: 'oia-spin 1s linear infinite, oia-pulse 2s ease-in-out infinite' }} />
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Calculating your impact analysis report...</div>
              <div style={{ color: '#666', fontSize: 14 }}>This will just take a moment</div>
            </div>
          )}
          {submitted && apiResults && (
            <>
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <img src="/images/OIE.png" alt="OIE" style={{ maxWidth: 400, height: 'auto' }} />
              </div>
              <h2 style={{ color: '#333', fontSize: '1.25rem', marginBottom: 24, lineHeight: 1.6, fontWeight: 600 }}>What preventable overprescribing is costing your health plan – right now:</h2>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 8, marginTop: 0 }}>Estimated Annual Cost ${financialImpact.toLocaleString()}</h3>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 0, marginTop: 16 }}>Members at Elevated Risk: {atRisk.toLocaleString()}</h3>
              </div>
              <p style={{ color: '#333', fontSize: '1rem', lineHeight: 1.6 }}>Using a prevention-first strategy, Opioid Free America estimates this amount of recoverable spend – strengthening your plan while protecting lives:</p>
              <h3 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: 16, marginTop: 0, color: '#3b82f6' }}>${targetedSavings.toLocaleString()}</h3>
              <hr style={{ border: 'none', borderTop: '1px solid #cecece', width: '100%' }} />
              <p style={{ color: '#333', fontSize: '1rem', lineHeight: 1.6 }}>How your County compares to the national average</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: 16, background: '#f9fafb', borderRadius: 8 }}>
                <div>
                  <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: 8, fontWeight: 600 }}>National Average</div>
                  <div style={{ fontSize: '1.125rem', color: '#333', fontWeight: 700 }}>{((math?.opioid_rx_rate ?? 0.2) * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: 8, fontWeight: 600 }}>Your County</div>
                  <div style={{ fontSize: '1.125rem', color: '#333', fontWeight: 700 }}>{countyRate !== null ? `${countyRate.toFixed(1)}%` : `${((math?.opioid_rx_rate ?? 0.2) * 100).toFixed(1)}%`}</div>
                </div>
              </div>
              <p style={{ color: '#333', fontSize: '1rem', lineHeight: 1.6 }}>Please check your inbox – your detailed Opioid Impact Estimate has just been emailed to you along with proven case studies. The report includes expanded analysis and our "Return on Community" (ROC) framework.</p>
              <p style={{ color: '#666', fontSize: '0.75rem', marginBottom: 0, lineHeight: 1.5, fontStyle: 'italic' }}>** Opioid Free America offers a no risk guarantee. Details about our program will be emailed to you shortly with a more detailed estimate.</p>
            </>
          )}
        </div>
      )}

      {step < 3 && (
        <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: step === 1 ? 'flex-end' : 'space-between' }}>
          {step > 1 && (
            <button type="button" onClick={handleBack} style={{ padding: '10px 20px', border: '1px solid #ccc', background: 'transparent', borderRadius: 8, cursor: 'pointer', color: '#333', fontWeight: 600 }}>Back</button>
          )}
          <button
            type="button"
            onClick={handleNext}
            disabled={(step === 1 && !validateStep1()) || (step === 2 && !validateStep2())}
            style={{
              padding: '10px 20px', border: 0, borderRadius: 8, background: '#111', color: 'white',
              cursor: ((step === 1 && !validateStep1()) || (step === 2 && !validateStep2())) ? 'not-allowed' : 'pointer',
              opacity: ((step === 1 && !validateStep1()) || (step === 2 && !validateStep2())) ? 0.5 : 1
            }}
          >
            {step === 2 ? 'Submit' : 'Next'}
          </button>
        </div>
      )}

      <style jsx>{`
        label { display: flex; flex-direction: column; }
        input { padding: 9.6px; border: 1px solid #ccc; border-radius: 4.8px; font-size: 0.8rem; font-family: Lato, sans-serif; }
        input:focus { outline: none; border-color: #111; }
        select { padding: 9.6px; border: 1px solid #ccc; border-radius: 4.8px; font-size: 0.8rem; font-family: Lato, sans-serif; }
        select:focus { outline: none; border-color: #111; }
        button { padding: 10px 14px; border: 0; border-radius: 8px; background: #111; color: white; cursor: pointer; font-family: Lato, sans-serif; font-size: 1rem; }
        [data-theme="dark"] button { background: #eee; color: #111; }
        [data-theme="dark"] input { background: #222; color: #eee; border-color: #444; }
        [data-theme="dark"] select { background: #222; color: #eee; border-color: #444; }
        h3, p { font-family: Lato, sans-serif; }
        @keyframes oia-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes oia-pulse { 0%, 100% { border-top-color: #22c55e; opacity: 1; } 50% { border-top-color: #16a34a; opacity: 0.7; } }
      `}</style>
    </div>
  );
}
