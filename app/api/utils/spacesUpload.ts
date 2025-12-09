import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Digital Ocean Spaces is S3-compatible, so we use AWS SDK
const getSpacesClient = () => {
  let endpoint = process.env.DO_SPACES_ENDPOINT; // e.g., 'nyc3.digitaloceanspaces.com'
  const region = process.env.DO_SPACES_REGION || 'nyc3';
  const accessKeyId = process.env.DO_SPACES_ACCESS_KEY_ID;
  const secretAccessKey = process.env.DO_SPACES_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Digital Ocean Spaces configuration missing. Please set DO_SPACES_ENDPOINT, DO_SPACES_ACCESS_KEY_ID, and DO_SPACES_SECRET_ACCESS_KEY environment variables.'
    );
  }

  // Strip any protocol prefix if present
  endpoint = endpoint.replace(/^https?:\/\//, '').trim();
  
  // Validate endpoint format
  if (!endpoint.includes('.')) {
    throw new Error(
      `Invalid DO_SPACES_ENDPOINT format: "${endpoint}". Should be like "nyc3.digitaloceanspaces.com" (without https://)`
    );
  }

  return new S3Client({
    endpoint: `https://${endpoint}`,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: false, // Digital Ocean Spaces uses virtual-hosted-style
  });
};

export interface UploadResult {
  url: string;
  key: string;
}

/**
 * Upload a file buffer to Digital Ocean Spaces
 * @param buffer File buffer to upload
 * @param fileName Name of the file (will be prefixed with folder path)
 * @param contentType MIME type of the file
 * @returns URL and key of the uploaded file
 */
export async function uploadToSpaces(
  buffer: Buffer,
  fileName: string,
  contentType: string = 'application/pdf'
): Promise<UploadResult> {
  const bucket = process.env.DO_SPACES_BUCKET;
  if (!bucket) {
    throw new Error('DO_SPACES_BUCKET environment variable is required');
  }

  const client = getSpacesClient();
  
  // Generate a unique filename with timestamp
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const key = `impact-reports/${timestamp}-${sanitizedFileName}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ACL: 'public-read', // Make individual files public while folder remains private
  });

  await client.send(command);

  // Construct the public URL
  let endpoint = process.env.DO_SPACES_ENDPOINT || '';
  // Strip any protocol prefix if present
  endpoint = endpoint.replace(/^https?:\/\//, '').trim();
  
  const cdnDomain = process.env.DO_SPACES_CDN_DOMAIN; // Optional: if you have a CDN domain
  const baseUrl = cdnDomain || `https://${bucket}.${endpoint}`;
  const url = `${baseUrl}/${key}`;

  return { url, key };
}

