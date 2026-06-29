/**
 * Storage service — Supabase Storage (S3-compatible, free tier: 1GB)
 *
 * Supabase Storage exposes an S3-compatible API so we keep the AWS SDK.
 * Just swap the endpoint + credentials to Supabase values.
 *
 * Required env vars:
 *   SUPABASE_URL          e.g. https://xxxx.supabase.co
 *   SUPABASE_ANON_KEY     from Supabase project settings
 *   SUPABASE_S3_REGION    e.g. eu-west-1  (find in Storage settings)
 *   SUPABASE_S3_ENDPOINT  e.g. https://xxxx.supabase.co/storage/v1/s3
 *   SUPABASE_S3_KEY       from Supabase Storage → S3 credentials
 *   SUPABASE_S3_SECRET    from Supabase Storage → S3 credentials
 *   STORAGE_BUCKET        e.g. dating-media  (create in Supabase Storage)
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

function getS3Client(): S3Client {
  return new S3Client({
    region: process.env.SUPABASE_S3_REGION || 'eu-west-1',
    endpoint: process.env.SUPABASE_S3_ENDPOINT,
    forcePathStyle: true, // Required for Supabase Storage
    credentials: {
      accessKeyId:     process.env.SUPABASE_S3_KEY!,
      secretAccessKey: process.env.SUPABASE_S3_SECRET!,
    },
  })
}

const BUCKET = () => process.env.STORAGE_BUCKET || 'dating-media'

// Public URL for a stored object
export function publicUrl(key: string): string {
  const base = process.env.SUPABASE_URL
  const bucket = BUCKET()
  return `${base}/storage/v1/object/public/${bucket}/${key}`
}

// Generate a presigned upload URL (expires in 5 minutes)
export async function presignUpload(
  key: string,
  contentType: string,
  expiresIn = 300,
): Promise<string> {
  const s3 = getS3Client()
  const command = new PutObjectCommand({
    Bucket: BUCKET(),
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(s3, command, { expiresIn })
}

// Delete an object (e.g. when user removes a photo)
export async function deleteObject(key: string): Promise<void> {
  const s3 = getS3Client()
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: key }))
}

// Build a storage key for a given folder + user + filename
export function storageKey(folder: string, userId: string, filename: string): string {
  return `${folder}/${userId}/${Date.now()}-${filename}`
}
