import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import { assert, token } from "../utils.js";
const root = resolve(process.env.UPLOAD_DIR ?? "work/uploads");
const s3 = process.env.S3_BUCKET
  ? new S3Client({
      region: process.env.S3_REGION ?? "auto",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    })
  : null;
export async function saveImage(
  file: Express.Multer.File | undefined,
  kind: "photo" | "verification" | "event",
) {
  assert(
    file && file.size <= 5 * 1024 * 1024,
    400,
    "Choose an image smaller than 5 MB.",
  );
  const image = sharp(file.buffer, {
    limitInputPixels: 25_000_000,
    failOn: "warning",
  });
  const meta = await image.metadata().catch(() => {
    throw new (class extends Error {
      status = 400;
    })("Unable to decode this image. Use a JPG, PNG, or WebP file.");
  });
  assert(
    meta.format &&
      ["jpeg", "png", "webp"].includes(meta.format) &&
      (meta.pages ?? 1) === 1,
    400,
    "Use a JPG, PNG, or WebP image.",
  );
  assert(
    meta.width && meta.height && meta.width >= 100 && meta.height >= 100,
    400,
    "Image must be at least 100 × 100 pixels.",
  );
  const bytes = await image
    .rotate()
    .resize(kind === "photo" ? 640 : 1600, kind === "photo" ? 640 : 1600, {
      fit: kind === "photo" ? "cover" : "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer();
  const key = `${kind}/${token()}.webp`;
  if (s3)
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: "image/webp",
        // Supabase encrypts stored data but does not accept AWS SSE headers.
        ServerSideEncryption:
          process.env.S3_PROVIDER === "supabase" ? undefined : "AES256",
      }),
    );
  else {
    assert(
      process.env.NODE_ENV !== "production",
      500,
      "Private storage is not configured.",
    );
    await mkdir(resolve(root, kind), { recursive: true });
    await writeFile(resolve(root, key), bytes, { mode: 0o600 });
  }
  return key;
}
export async function getImage(key: string) {
  assert(
    /^(photo|verification|event)\/[a-f0-9]{64}\.webp$/.test(key),
    404,
    "Image not found.",
  );
  if (s3) {
    const r = await s3.send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
    );
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  return readFile(resolve(root, key));
}
export async function removeImage(key: string) {
  assert(
    /^(photo|verification|event)\/[a-f0-9]{64}\.webp$/.test(key),
    400,
    "Invalid image key.",
  );
  if (s3)
    await s3.send(
      new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
    );
  else
    await unlink(resolve(root, key)).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== "ENOENT") throw e;
    });
}
