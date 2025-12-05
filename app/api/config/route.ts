import { NextResponse } from 'next/server';
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const version = searchParams.get('version') || process.env.NEXT_PUBLIC_CONFIG_VERSION || 'dev';
  const form = searchParams.get('form') || 'impact';
  return NextResponse.json({
    version, form,
    labels: { impact_title: 'Impact Analysis', community_title: 'Return-on-Community' },
    math: {
      avg_dependents_per_employee: 2.5,
      rx_rate: 0.5,
      opioid_rx_rate: 0.2,
      at_risk_rate: 0.3,
      prescriber_non_cdc_rate: 0.9,
      avg_med_claim_usd: 4000
    }
  }, { headers: { 'Cache-Control': 'public, max-age=60' } });
}

/* 
POTENTIAL FUTURE CONFIG BASED ON REVIEW OF THE REAL IMPACT ANALYSIS
{
  "version": "1.0.0",
  "forms": {
    "impact": {
      "population": {
        "avg_dependents_per_employee": 2.5,
        "rx_rate": 0.5,
        "opioid_rx_rate": 0.2
      },
      "risk": {
        "at_risk_rate": 0.3,
        "prescriber_non_cdc_rate": 0.9
      },
      "cost": {
        "orx_case_cost": 7500,
        "managed_orx_case_cost": 4500,
        "net_orx_cost": 4000,
        "avg_claim_cost": 3500
      },
      "output": {
        "show_targeted_savings_pct": true
      }
    }
  }
}

Why these four cost values?

orx_case_cost (7,500)
“This is what one unmanaged opioid member costs us.”

managed_orx_case_cost (4,500)
“If we intervene / manage, this is what it costs.”

net_orx_cost (4,000)
“This is the number we actually want to show as ‘Financial Impact’ when multiplied by population.”
→ this is the one they used in: 4,000 × 3,000 = 12,000,000

avg_claim_cost (3,500)
They mentioned it, so let’s store it. It might end up in “here’s what others pay / baseline payers” type messaging.
*/