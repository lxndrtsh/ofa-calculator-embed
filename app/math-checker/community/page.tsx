'use client';

import { useEffect, useState } from 'react';
import { US_STATES, getCountiesForState, getCountyRate } from '../../embed/utils/countyData';

export default function MathCheckerCommunityPage() {
  const [config, setConfig] = useState<any>(null);
  const [counties, setCounties] = useState<Array<{ value: string; label: string }>>([]);
  
  // Inputs
  const [population, setPopulation] = useState<string>('');
  const [state, setState] = useState<string>('');
  const [county, setCounty] = useState<string>('');
  const [countyRate, setCountyRate] = useState<number | null>(null);
  
  // Load config on mount
  useEffect(() => {
    const apiBase = typeof window !== 'undefined' ? window.location.origin : '';
    fetch(`${apiBase}/api/config?version=dev&form=community`)
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

  // Load county rate and population when county changes
  useEffect(() => {
    if (state && county && county !== 'County Not Listed') {
      const apiBase = typeof window !== 'undefined' ? window.location.origin : '';
      
      // Load county rate
      getCountyRate(state, county, apiBase)
        .then(rate => setCountyRate(rate))
        .catch(err => console.error('Failed to load county rate:', err));
      
      // Auto-populate population from county data
      fetch(`${apiBase}/api/lookup/population?state=${encodeURIComponent(state)}&county=${encodeURIComponent(county)}`)
        .then(r => r.json())
        .then(data => {
          if (data?.population) {
            setPopulation(data.population.toLocaleString());
          }
        })
        .catch(err => console.error('Failed to load population:', err));
    } else {
      setCountyRate(null);
    }
  }, [state, county]);

  // Calculations (same logic as community page)
  const pop = Number(population.replace(/,/g, '') || '0');
  const members = pop;
  const withRx = config ? Math.round(members * config.math.rx_rate) : 0;
  
  // Calculate ORx/100 and withORx
  let withORx: number;
  let orxPer100: number;
  let usedCountyRate: boolean;
  
  if (countyRate !== null && config) {
    // Use county-specific ORx/100 rate (per 100 population)
    orxPer100 = countyRate;
    const opioidRxRate = orxPer100 / 100; // Convert to decimal (e.g., 10.0 -> 0.10)
    withORx = Math.round(members * opioidRxRate);
    usedCountyRate = true;
  } else if (config) {
    // Default: 20% of residents with Rx
    const opioidRxRate = config.math.opioid_rx_rate; // 0.2 (20%)
    withORx = Math.round(withRx * opioidRxRate);
    // Calculate equivalent ORx/100 rate for display
    orxPer100 = members > 0 ? (withORx / members) * 100 : config.math.default_orx_per_100 || 10.0;
    usedCountyRate = false;
  } else {
    // Fallback
    withORx = 0;
    orxPer100 = 10.0;
    usedCountyRate = false;
  }
  
  const atRisk = config ? Math.round(withORx * config.math.at_risk_rate) : 0;
  const prescribers = config ? Math.round(atRisk * config.math.prescriber_non_cdc_rate) : 0;

  // Calculate milestones: Year 2 (24% decrease) and Year 3 (35% decrease) in ORx/100 rate
  const year2OrxPer100 = config ? orxPer100 * (1 - config.math.year2_decrease_rate) : orxPer100 * 0.76;
  const year3OrxPer100 = config ? orxPer100 * (1 - config.math.year3_decrease_rate) : orxPer100 * 0.65;
  
  const year2OrxRate = year2OrxPer100 / 100;
  const year3OrxRate = year3OrxPer100 / 100;
  
  // Calculate people with ORx at each milestone
  const year2WithORx = Math.round(members * year2OrxRate);
  const year3WithORx = Math.round(members * year3OrxRate);
  
  // Calculate people potentially saved (decrease in ORx cases)
  const year2PeopleSaved = withORx - year2WithORx;
  const year3PeopleSaved = withORx - year3WithORx;

  const formatNumber = (num: number) => num.toLocaleString();
  const formatPercent = (num: number, decimals: number = 1) => `${num.toFixed(decimals)}`;

  return (
    <div style={{ 
      maxWidth: '1200px', 
      margin: '0 auto', 
      padding: '32px 16px',
      fontFamily: 'Lato, sans-serif'
    }}>
      <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '8px' }}>
        Return-on-Community Math Checker
      </h1>
      <p style={{ color: '#666', marginBottom: '32px' }}>
        Enter population and location to see all math variables, equations, and milestone projections
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
              Total Population *
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={population}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9,]/g, '');
                setPopulation(val);
              }}
              placeholder="e.g., 100,000"
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
            <div><strong>rx_rate:</strong> {(config.math.rx_rate * 100).toFixed(0)}%</div>
            <div><strong>opioid_rx_rate (default):</strong> {(config.math.opioid_rx_rate * 100).toFixed(0)}%</div>
            <div><strong>at_risk_rate:</strong> {(config.math.at_risk_rate * 100).toFixed(0)}%</div>
            <div><strong>prescriber_non_cdc_rate:</strong> {(config.math.prescriber_non_cdc_rate * 100).toFixed(0)}%</div>
            <div><strong>year2_decrease_rate:</strong> {(config.math.year2_decrease_rate * 100).toFixed(0)}%</div>
            <div><strong>year3_decrease_rate:</strong> {(config.math.year3_decrease_rate * 100).toFixed(0)}%</div>
            <div><strong>default_orx_per_100:</strong> {config.math.default_orx_per_100}</div>
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
            <div><strong>County ORx Rate (per 100):</strong> {countyRate}</div>
            <div style={{ marginTop: '8px', color: '#666', fontSize: '0.9rem' }}>
              (This will override the default opioid_rx_rate calculation)
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
          Baseline Calculations
        </h2>

        <div style={{ display: 'grid', gap: '24px' }}>
          {/* Step 1: Population */}
          <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '8px' }}>
              1. Total Population
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
              members = population = {formatNumber(pop)}
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111' }}>
              = {formatNumber(members)}
            </div>
          </div>

          {/* Step 2: With Rx */}
          <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '8px' }}>
              2. Residents with Prescription (Rx)
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
              withRx = members × rx_rate = {formatNumber(members)} × {(config?.math.rx_rate * 100 || 50).toFixed(0)}%
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111' }}>
              = {formatNumber(withRx)}
            </div>
          </div>

          {/* Step 3: ORx/100 Rate */}
          <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '8px' }}>
              3. ORx Rate per 100 Residents
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
              {countyRate !== null 
                ? `orxPer100 = countyRate = ${countyRate} (from county data)`
                : `orxPer100 = (withORx ÷ members) × 100 = (${formatNumber(withORx)} ÷ ${formatNumber(members)}) × 100`}
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111' }}>
              = {formatPercent(orxPer100)} per 100 residents
            </div>
            <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#666', fontStyle: 'italic' }}>
              {usedCountyRate ? '✓ Using county-specific rate' : '⚠ Using default calculation (20% of Rx residents)'}
            </div>
          </div>

          {/* Step 4: With ORx */}
          <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '8px' }}>
              4. Residents with Opioid Rx (ORx)
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
              {countyRate !== null 
                ? `withORx = members × (orxPer100 ÷ 100) = ${formatNumber(members)} × (${formatPercent(orxPer100)} ÷ 100)`
                : `withORx = withRx × opioid_rx_rate = ${formatNumber(withRx)} × ${(config?.math.opioid_rx_rate * 100 || 20).toFixed(0)}%`}
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111' }}>
              = {formatNumber(withORx)}
            </div>
          </div>

          {/* Step 5: At Risk */}
          <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '8px' }}>
              5. Identified At-Risk Residents
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
              atRisk = withORx × at_risk_rate = {formatNumber(withORx)} × {(config?.math.at_risk_rate * 100 || 30).toFixed(0)}%
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
              prescribers = atRisk × prescriber_non_cdc_rate = {formatNumber(atRisk)} × {(config?.math.prescriber_non_cdc_rate * 100 || 90).toFixed(0)}%
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111' }}>
              = {formatNumber(prescribers)}
            </div>
          </div>
        </div>
      </div>

      {/* Milestones Section */}
      <div style={{
        background: '#fff',
        padding: '24px',
        borderRadius: '8px',
        marginBottom: '32px',
        border: '2px solid #22c55e'
      }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '24px', color: '#16a34a' }}>
          Projected Impact Milestones
        </h2>

        <div style={{ display: 'grid', gap: '32px' }}>
          {/* Year 2 Milestone */}
          <div style={{ 
            padding: '20px', 
            background: '#f0fdf4', 
            borderRadius: '8px', 
            border: '2px solid #86efac' 
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '16px', color: '#16a34a' }}>
              Year 2 Milestone: {(config?.math.year2_decrease_rate * 100 || 24).toFixed(0)}% Decrease in ORx Rate
            </h3>
            
            <div style={{ display: 'grid', gap: '16px' }}>
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
                  year2OrxPer100 = orxPer100 × (1 - year2_decrease_rate) = {formatPercent(orxPer100)} × (1 - {(config?.math.year2_decrease_rate || 0.24).toFixed(2)})
                </div>
                <div style={{ fontSize: '1.125rem', fontWeight: '700', color: '#16a34a', marginBottom: '16px' }}>
                  Target ORx Rate: {formatPercent(year2OrxPer100)} per 100 residents
                </div>
              </div>
              
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
                  year2WithORx = members × (year2OrxPer100 ÷ 100) = {formatNumber(members)} × ({formatPercent(year2OrxPer100)} ÷ 100)
                </div>
                <div style={{ fontSize: '1.125rem', fontWeight: '700', color: '#111', marginBottom: '16px' }}>
                  Projected ORx Residents: {formatNumber(year2WithORx)}
                </div>
              </div>
              
              <div style={{ paddingTop: '16px', borderTop: '2px solid #86efac' }}>
                <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
                  year2PeopleSaved = withORx - year2WithORx = {formatNumber(withORx)} - {formatNumber(year2WithORx)}
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#16a34a' }}>
                  Potential Reduction: {formatNumber(year2PeopleSaved)} residents
                </div>
              </div>
            </div>
          </div>

          {/* Year 3 Milestone */}
          <div style={{ 
            padding: '20px', 
            background: '#f0fdf4', 
            borderRadius: '8px', 
            border: '2px solid #86efac' 
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '16px', color: '#16a34a' }}>
              Year 3 Milestone: {(config?.math.year3_decrease_rate * 100 || 35).toFixed(0)}% Decrease in ORx Rate
            </h3>
            
            <div style={{ display: 'grid', gap: '16px' }}>
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
                  year3OrxPer100 = orxPer100 × (1 - year3_decrease_rate) = {formatPercent(orxPer100)} × (1 - {(config?.math.year3_decrease_rate || 0.35).toFixed(2)})
                </div>
                <div style={{ fontSize: '1.125rem', fontWeight: '700', color: '#16a34a', marginBottom: '16px' }}>
                  Target ORx Rate: {formatPercent(year3OrxPer100)} per 100 residents
                </div>
              </div>
              
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
                  year3WithORx = members × (year3OrxPer100 ÷ 100) = {formatNumber(members)} × ({formatPercent(year3OrxPer100)} ÷ 100)
                </div>
                <div style={{ fontSize: '1.125rem', fontWeight: '700', color: '#111', marginBottom: '16px' }}>
                  Projected ORx Residents: {formatNumber(year3WithORx)}
                </div>
              </div>
              
              <div style={{ paddingTop: '16px', borderTop: '2px solid #86efac' }}>
                <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
                  year3PeopleSaved = withORx - year3WithORx = {formatNumber(withORx)} - {formatNumber(year3WithORx)}
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#16a34a' }}>
                  Potential Reduction: {formatNumber(year3PeopleSaved)} residents
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
          Summary
        </h2>
        <div style={{ display: 'grid', gap: '16px', fontSize: '1.125rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid #bfdbfe' }}>
            <span><strong>Current ORx Rate:</strong></span>
            <span style={{ fontWeight: '700', color: '#3b82f6' }}>{formatPercent(orxPer100)} per 100 residents</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid #bfdbfe' }}>
            <span><strong>Current ORx Residents:</strong></span>
            <span style={{ fontWeight: '700', color: '#3b82f6' }}>{formatNumber(withORx)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid #bfdbfe' }}>
            <span><strong>Year 2 Potential Reduction:</strong></span>
            <span style={{ fontWeight: '700', color: '#16a34a' }}>{formatNumber(year2PeopleSaved)} residents</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span><strong>Year 3 Potential Reduction:</strong></span>
            <span style={{ fontWeight: '700', color: '#16a34a' }}>{formatNumber(year3PeopleSaved)} residents</span>
          </div>
        </div>
      </div>
    </div>
  );
}
