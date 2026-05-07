import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

let _client: S3Client | null = null;

function client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${env.r2.accountId()}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.r2.accessKeyId(),
      secretAccessKey: env.r2.secretAccessKey(),
    },
  });
  return _client;
}

export type UploadResult = {
  key: string;
  url: string;
};

export async function uploadBuffer(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<UploadResult> {
  await client().send(
    new PutObjectCommand({
      Bucket: env.r2.bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return { key, url: await publicUrl(key) };
}

export async function uploadFromUrl(key: string, sourceUrl: string, contentType?: string): Promise<UploadResult> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`Failed to fetch source asset (${res.status}) from ${sourceUrl}`);
  const ct = contentType ?? res.headers.get("content-type") ?? "application/octet-stream";
  const buf = Buffer.from(await res.arrayBuffer());
  return uploadBuffer(key, buf, ct);
}

export async function publicUrl(key: string): Promise<string> {
  if (env.r2.publicBaseUrl) {
    return `${env.r2.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }
  // Fall back to a presigned URL valid for 7 days.
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: env.r2.bucket(), Key: key }),
    { expiresIn: 60 * 60 * 24 * 7 },
  );
}
