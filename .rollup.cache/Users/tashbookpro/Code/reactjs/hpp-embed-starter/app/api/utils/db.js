import mysql from 'mysql2/promise';
// Get database connection from environment variables
function getDbConfig() {
    return {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
    };
}
// Create a connection pool (reusable connections)
let pool = null;
function getPool() {
    if (!pool) {
        const config = getDbConfig();
        if (!config.host || !config.user || !config.password || !config.database) {
            throw new Error('Database configuration is missing. Please set DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME environment variables.');
        }
        pool = mysql.createPool({
            ...config,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
        });
    }
    return pool;
}
// Save impact submission to database
export async function saveImpactSubmission(websiteUrl, formData, responseData) {
    try {
        const connection = await getPool().getConnection();
        try {
            await connection.query(`INSERT INTO ofa_impact_submissions (date_submitted, website_url, form_data, response_data) 
         VALUES (NOW(), ?, ?, ?)`, [
                websiteUrl || null,
                JSON.stringify(formData),
                JSON.stringify(responseData),
            ]);
        }
        finally {
            connection.release();
        }
    }
    catch (error) {
        // Log error but don't throw - we don't want DB failures to break submissions
        console.error('Failed to save impact submission to database:', error);
    }
}
// Save community submission to database
export async function saveCommunitySubmission(websiteUrl, formData, responseData) {
    try {
        const connection = await getPool().getConnection();
        try {
            await connection.query(`INSERT INTO ofa_community_submissions (date_submitted, website_url, form_data, response_data) 
         VALUES (NOW(), ?, ?, ?)`, [
                websiteUrl || null,
                JSON.stringify(formData),
                JSON.stringify(responseData),
            ]);
        }
        finally {
            connection.release();
        }
    }
    catch (error) {
        // Log error but don't throw - we don't want DB failures to break submissions
        console.error('Failed to save community submission to database:', error);
    }
}
// Helper to get website URL from request
export function getWebsiteUrl(req) {
    // Try origin first (most reliable)
    const origin = req.headers.get('origin');
    if (origin)
        return origin;
    // Fall back to referer
    const referer = req.headers.get('referer');
    if (referer) {
        try {
            const url = new URL(referer);
            return url.origin;
        }
        catch {
            return referer;
        }
    }
    return null;
}
//# sourceMappingURL=db.js.map