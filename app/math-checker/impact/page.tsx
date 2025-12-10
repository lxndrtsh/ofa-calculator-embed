'use client';

import { useEffect, useState } from 'react';
import { US_STATES, getCountiesForState, getCountyRate } from '../../embed/utils/countyData';

export default function MathCheckerImpactPage() {
  const [config, setConfig] = useState<any>(null);
  const [counties, setCounties] = useState<Array<{ value: string; label: string }>>([]);
  
  // Inputs
  const [employees, setEmployees] = useState<string>('');
  const [planMembers, setPlanMembers] = useState<string>('');
  const [state, setState] = useState<string>('');
  const [county, setCounty] = useState<string>('');
  const [countyRate, setCountyRate] = useState<number | null>(null);
  
  // Load config on mount
  useEffect(() => {
    const apiBase = typeof window !== 'undefined' ? window.location.origin : '';
    fetch(`${apiBase}/api/config?version=dev&form=impact`)
      .then(r => r.json())
      .then(data => setConfig(data))
      .catch(err => console.error('Failed to load config:', err));
  }, []);

  // Load counties when state changes
  useEffect(() => {
    if (state) {
      const apiBase = typeof window !== 'undefined' ? window.location.origin : '';
      getCountiesForState(state, apiBase)
        .then(counties => {
          setCounties(counties);
          setCounty(''); // Reset county when state changes
          setCountyRate(null);
        })
        .catch(err => console.error('Failed to load counties:', err));
    } else {
      setCounties([]);
      setCounty('');
      setCountyRate(null);
    }
  }, [state]);

  // Load county rate when county changes
  useEffect(() => {
    if (state && county && county !== 'County Not Listed') {
      const apiBase = typeof window !== 'undefined' ? window.location.origin : '';
      getCountyRate(state, county, apiBase)
        .then(rate => setCountyRate(rate))
        .catch(err => console.error('Failed to load county rate:', err));
    } else {
      setCountyRate(null);
    }
  }, [state, county]);

  // Calculations (same logic as impact page)
  const employeesNum = Number(employees.replace(/,/g, '') || '0');
  const planMembersNum = Number(planMembers.replace(/,/g, '') || '0');
  
  const members = planMembersNum > 0 
    ? planMembersNum 
    : (config ? Math.round(employeesNum * config.math.avg_dependents_per_employee) : 0);
  
  const withRx = config ? Math.round(members * config.math.rx_rate) : 0;
  
  const opioidRxRate = countyRate !== null 
    ? countyRate / 100 
    : (config ? config.math.opioid_rx_rate : 0.2);
  
  const withORx = config ? Math.round(withRx * opioidRxRate) : 0;
  const atRisk = config ? Math.round(withORx * config.math.at_risk_rate) : 0;
  const prescribers = config ? Math.round(atRisk * config.math.prescriber_non_cdc_rate) : 0;

  // Financial calculations (hardcoded values)
  const costPerMemberORx = 7500;
  const netCostPerMemberORx = 4000;
  const avgCareManagedCost = 4500;
  const savingsPerMember = costPerMemberORx - avgCareManagedCost; // $3,000
  const financialImpact = withORx * netCostPerMemberORx;
  const targetedSavings = withORx * savingsPerMember;
  const targetedSavingsPercent = financialImpact > 0 
    ? Math.round((targetedSavings / financialImpact) * 100) 
    : 0;

  const formatNumber = (num: number) => num.toLocaleString();
  const formatCurrency = (num: number) => `$${num.toLocaleString()}`;
  const formatPercent = (num: number, decimals: number = 2) => `${(num * 100).toFixed(decimals)}%`;

  return (
    <div style={{ 
      maxWidth: '1200px', 
      margin: '0 auto', 
      padding: '32px 16px',
      fontFamily: 'Lato, sans-serif'
    }}>
      <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '8px' }}>
        Impact Report Math Checker
      </h1>
      <p style={{ color: '#666', marginBottom: '32px' }}>
        Enter basic values to see all math variables, equations, and results
      </p>

      {/* Input Section */}
      <div style={{
        background: '#f9fafb',
        padding: '24px',
        borderRadius: '8px',
        marginBottom: '32px',
        border: '1px solid #e5e7eb'
      }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '16px' }}>
          Inputs
        </h2>
        <div style={{ display: 'grid', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
              Total Employees
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={employees}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9,]/g, '');
                setEmployees(val);
                if (val) setPlanMembers(''); // Clear plan members if employees entered
              }}
              placeholder="e.g., 10,000"
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #ccc',
                borderRadius: '6px',
                fontSize: '1rem'
              }}
            />
          </div>
          
          <div style={{ textAlign: 'center', fontWeight: '600', color: '#666' }}>OR</div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
              Plan Members
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={planMembers}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9,]/g, '');
                setPlanMembers(val);
                if (val) setEmployees(''); // Clear employees if plan members entered
              }}
              placeholder="e.g., 25,000"
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #ccc',
                borderRadius: '6px',
                fontSize: '1rem'
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                State (Optional)
              </label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #ccc',
                  borderRadius: '6px',
                  fontSize: '1rem'
                }}
              >
                <option value="">Select State</option>
                {US_STATES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                County (Optional)
              </label>
              <select
                value={county}
                onChange={(e) => setCounty(e.target.value)}
                disabled={!state}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #ccc',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  opacity: state ? 1 : 0.6
                }}
              >
                <option value="">Select County</option>
                {counties.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Config Variables Section */}
      {config && (
        <div style={{
          background: '#eff6ff',
          padding: '24px',
          borderRadius: '8px',
          marginBottom: '32px',
          border: '1px solid #bfdbfe'
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '16px' }}>
            Config Variables (from API)
          </h2>
          <div style={{ display: 'grid', gap: '8px', fontFamily: 'monospace', fontSize: '0.9rem' }}>
            <div><strong>avg_dependents_per_employee:</strong> {config.math.avg_dependents_per_employee}</div>
            <div><strong>rx_rate:</strong> {formatPercent(config.math.rx_rate)}</div>
            <div><strong>opioid_rx_rate (default):</strong> {formatPercent(config.math.opioid_rx_rate)}</div>
            <div><strong>at_risk_rate:</strong> {formatPercent(config.math.at_risk_rate)}</div>
            <div><strong>prescriber_non_cdc_rate:</strong> {formatPercent(config.math.prescriber_non_cdc_rate)}</div>
            <div><strong>avg_med_claim_usd:</strong> {formatCurrency(config.math.avg_med_claim_usd)}</div>
          </div>
        </div>
      )}

      {/* County Rate (if available) */}
      {countyRate !== null && (
        <div style={{
          background: '#f0fdf4',
          padding: '24px',
          borderRadius: '8px',
          marginBottom: '32px',
          border: '1px solid #86efac'
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '16px' }}>
            County-Specific Rate
          </h2>
          <div style={{ fontFamily: 'monospace', fontSize: '1rem' }}>
            <div><strong>County Rate (per 100):</strong> {countyRate}</div>
            <div><strong>Converted Opioid Rx Rate:</strong> {formatPercent(countyRate / 100)}</div>
            <div style={{ marginTop: '8px', color: '#666', fontSize: '0.9rem' }}>
              (This will override the default opioid_rx_rate)
            </div>
          </div>
        </div>
      )}

      {/* Calculations Section */}
      <div style={{
        background: '#fff',
        padding: '24px',
        borderRadius: '8px',
        marginBottom: '32px',
        border: '1px solid #e5e7eb'
      }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '24px' }}>
          Calculations
        </h2>

        <div style={{ display: 'grid', gap: '24px' }}>
          {/* Step 1: Members */}
          <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '8px' }}>
              1. Plan Members
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
              {planMembersNum > 0 
                ? `members = planMembers = ${formatNumber(planMembersNum)}`
                : `members = employees × avg_dependents_per_employee = ${formatNumber(employeesNum)} × ${config?.math.avg_dependents_per_employee || 2.5}`}
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111' }}>
              = {formatNumber(members)}
            </div>
          </div>

          {/* Step 2: With Rx */}
          <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '8px' }}>
              2. Members with Rx
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
              withRx = members × rx_rate = {formatNumber(members)} × {formatPercent(config?.math.rx_rate || 0.5)}
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111' }}>
              = {formatNumber(withRx)}
            </div>
          </div>

          {/* Step 3: Opioid Rx Rate */}
          <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '8px' }}>
              3. Opioid Rx Rate
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
              {countyRate !== null 
                ? `opioidRxRate = countyRate ÷ 100 = ${countyRate} ÷ 100`
                : `opioidRxRate = default_opioid_rx_rate = ${formatPercent(config?.math.opioid_rx_rate || 0.2)}`}
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111' }}>
              = {formatPercent(opioidRxRate)}
            </div>
          </div>

          {/* Step 4: With ORx */}
          <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '8px' }}>
              4. Members with Opioid Rx
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
              withORx = withRx × opioidRxRate = {formatNumber(withRx)} × {formatPercent(opioidRxRate)}
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111' }}>
              = {formatNumber(withORx)}
            </div>
          </div>

          {/* Step 5: At Risk */}
          <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '8px' }}>
              5. Identified At-Risk Members
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
              atRisk = withORx × at_risk_rate = {formatNumber(withORx)} × {formatPercent(config?.math.at_risk_rate || 0.3)}
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111' }}>
              = {formatNumber(atRisk)}
            </div>
          </div>

          {/* Step 6: Prescribers */}
          <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '8px' }}>
              6. Prescribers Identified
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
              prescribers = atRisk × prescriber_non_cdc_rate = {formatNumber(atRisk)} × {formatPercent(config?.math.prescriber_non_cdc_rate || 0.9)}
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111' }}>
              = {formatNumber(prescribers)}
            </div>
          </div>

          {/* Financial Calculations */}
          <div style={{ 
            marginTop: '16px', 
            padding: '16px', 
            background: '#fef3c7', 
            borderRadius: '6px', 
            border: '2px solid #fbbf24' 
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '16px' }}>
              Financial Calculations (Hardcoded Values)
            </h3>
            
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666' }}>
                  costPerMemberORx = <strong>{formatCurrency(costPerMemberORx)}</strong>
                </div>
              </div>
              
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666' }}>
                  netCostPerMemberORx = <strong>{formatCurrency(netCostPerMemberORx)}</strong>
                </div>
              </div>
              
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666' }}>
                  avgCareManagedCost = <strong>{formatCurrency(avgCareManagedCost)}</strong>
                </div>
              </div>
              
              <div style={{ paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
                  savingsPerMember = costPerMemberORx - avgCareManagedCost = {formatCurrency(costPerMemberORx)} - {formatCurrency(avgCareManagedCost)}
                </div>
                <div style={{ fontSize: '1.125rem', fontWeight: '700', color: '#111' }}>
                  = {formatCurrency(savingsPerMember)}
                </div>
              </div>
              
              <div style={{ paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
                  financialImpact = withORx × netCostPerMemberORx = {formatNumber(withORx)} × {formatCurrency(netCostPerMemberORx)}
                </div>
                <div style={{ fontSize: '1.125rem', fontWeight: '700', color: '#059669' }}>
                  = {formatCurrency(financialImpact)}
                </div>
              </div>
              
              <div style={{ paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
                  targetedSavings = withORx × savingsPerMember = {formatNumber(withORx)} × {formatCurrency(savingsPerMember)}
                </div>
                <div style={{ fontSize: '1.125rem', fontWeight: '700', color: '#059669' }}>
                  = {formatCurrency(targetedSavings)}
                </div>
              </div>
              
              <div style={{ paddingTop: '12px', borderTop: '2px solid #e5e7eb' }}>
                <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
                  targetedSavingsPercent = (targetedSavings ÷ financialImpact) × 100 = ({formatCurrency(targetedSavings)} ÷ {formatCurrency(financialImpact)}) × 100
                </div>
                <div style={{ fontSize: '1.125rem', fontWeight: '700', color: '#059669' }}>
                  = {targetedSavingsPercent}%
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Section */}
      <div style={{
        background: '#f0f9ff',
        padding: '24px',
        borderRadius: '8px',
        border: '2px solid #3b82f6'
      }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '16px' }}>
          Final Results Summary
        </h2>
        <div style={{ display: 'grid', gap: '12px', fontSize: '1.125rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span><strong>Financial Impact of Opioids:</strong></span>
            <span style={{ fontWeight: '700', color: '#3b82f6' }}>{formatCurrency(financialImpact)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span><strong>Targeted Savings:</strong></span>
            <span style={{ fontWeight: '700', color: '#3b82f6' }}>
              {formatCurrency(targetedSavings)} ({targetedSavingsPercent}%)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

