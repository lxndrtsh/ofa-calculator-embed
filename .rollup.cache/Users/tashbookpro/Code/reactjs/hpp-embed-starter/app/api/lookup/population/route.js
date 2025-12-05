import { NextResponse } from 'next/server';
export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const state = searchParams.get('state') || '';
    const county = searchParams.get('county') || '';
    return NextResponse.json({ state, county, population: null });
}
//# sourceMappingURL=route.js.map