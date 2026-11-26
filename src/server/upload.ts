/**
 * PROOFLYN — Secure File Upload Validation and Storage
 * - Allowlist extensions (.pdf, .png, .jpg, .jpeg, .csv, .txt)
 * - Magic-byte verification (rejects executables, archives, spoofed extensions)
 * - 10 MB size cap
 * - UUID storage names outside public/, path-traversal proof
 */

import fs from 'node:fs';
import path from 'node:path';
import { generateId, sha256 } from '@/core';
import { loadEnvFile } from '@/db/env';
import { ServiceError } from '@/server/services/investigation-service';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.csv', '.txt']);

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
};

export function getUploadDir(): string {
  loadEnvFile();
  const configured = process.env.UPLOAD_DIR || './uploads';
  const resolved = path.resolve(configured);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  return resolved;
}

export interface ValidatedUpload {
  safeOriginalFilename: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  sha256Hex: string;
}

function hasDisallowedBinaryHeader(buf: Buffer): boolean {
  if (buf.length >= 2 && buf[0] === 0x4d && buf[1] === 0x5a) return true; // MZ (EXE/DLL)
  if (buf.length >= 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) return true; // ELF
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return true; // ZIP/archive
  if (buf.length >= 4 && buf.subarray(0, 4).toString('ascii') === 'Rar!') return true; // RAR
  if (buf.length >= 6 && buf[0] === 0x37 && buf[1] === 0x7a && buf[2] === 0xbc && buf[3] === 0xaf) return true; // 7z
  if (buf.length >= 2 && buf[0] === 0x23 && buf[1] === 0x21) return true; // #! script
  return false;
}

function isValidUtf8Text(buf: Buffer): boolean {
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 0x00) return false;
    // Reject ASCII control characters other than \t (9), \n (10), \r (13)
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) {
      return false;
    }
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

export function validateUploadFile(rawFilename: string, buffer: Buffer): ValidatedUpload {
  const base = path.basename(rawFilename || '').trim();
  if (!base || base === '.' || base === '..') {
    throw new ServiceError('INVALID_UPLOAD', 'Missing or invalid filename.', 400);
  }
  if (rawFilename.includes('..') || rawFilename.includes('/') || rawFilename.includes('\\')) {
    throw new ServiceError('INVALID_UPLOAD', 'Path traversal sequences are not allowed in filenames.', 400);
  }

  const ext = path.extname(base).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new ServiceError(
      'UNSUPPORTED_FILE_TYPE',
      `File extension "${ext || '(none)'}" is not allowed. Accepted: PDF, PNG, JPG/JPEG, CSV, TXT.`,
      400
    );
  }

  if (buffer.length === 0) {
    throw new ServiceError('INVALID_UPLOAD', 'Uploaded file is empty.', 400);
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new ServiceError(
      'FILE_TOO_LARGE',
      `Uploaded file exceeds the 10 MB limit (${buffer.length} bytes).`,
      413
    );
  }

  if (hasDisallowedBinaryHeader(buffer)) {
    throw new ServiceError(
      'UNSAFE_FILE_CONTENT',
      'Executable or archive file signatures are rejected.',
      400
    );
  }

  if (ext === '.pdf') {
    if (buffer.length < 5 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new ServiceError('MAGIC_BYTE_MISMATCH', 'File content does not match PDF magic bytes (%PDF-).', 400);
    }
  } else if (ext === '.png') {
    const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buffer.length < 8 || !buffer.subarray(0, 8).equals(pngSig)) {
      throw new ServiceError('MAGIC_BYTE_MISMATCH', 'File content does not match PNG magic bytes.', 400);
    }
  } else if (ext === '.jpg' || ext === '.jpeg') {
    if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
      throw new ServiceError('MAGIC_BYTE_MISMATCH', 'File content does not match JPEG magic bytes.', 400);
    }
  } else if (ext === '.csv' || ext === '.txt') {
    if (!isValidUtf8Text(buffer)) {
      throw new ServiceError('MAGIC_BYTE_MISMATCH', 'CSV/TXT file must contain valid UTF-8 printable text.', 400);
    }
  }

  return {
    safeOriginalFilename: base.replace(/[^\w.\- ()]/g, '_'),
    extension: ext,
    mimeType: MIME_BY_EXTENSION[ext],
    sizeBytes: buffer.length,
    sha256Hex: sha256(buffer),
  };
}

export function storeUploadFile(uploadDir: string, extension: string, buffer: Buffer): string {
  const root = path.resolve(uploadDir);
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  const storageName = `${generateId()}${extension}`;
  const targetPath = path.resolve(root, storageName);
  if (!targetPath.startsWith(root + path.sep)) {
    throw new ServiceError('INVALID_PATH', 'Resolved storage path escaped upload directory.', 400);
  }
  fs.writeFileSync(targetPath, buffer);
  try {
    fs.chmodSync(targetPath, 0o444);
  } catch {
    // Ignore chmod limitations on some Windows filesystems
  }
  return storageName;
}

export function readStoredUploadFile(uploadDir: string, storagePath: string): Buffer {
  const root = path.resolve(uploadDir);
  const cleanName = path.basename(storagePath);
  if (!cleanName || cleanName !== storagePath || storagePath.includes('..')) {
    throw new ServiceError('INVALID_PATH', 'Invalid document storage path.', 400);
  }
  const fullPath = path.resolve(root, cleanName);
  if (!fullPath.startsWith(root + path.sep) || !fs.existsSync(fullPath)) {
    throw new ServiceError('NOT_FOUND', 'Stored source document file was not found on disk.', 404);
  }
  return fs.readFileSync(fullPath);
}

export function removeStoredUploadFile(uploadDir: string, storagePath: string): void {
  try {
    const root = path.resolve(uploadDir);
    const fullPath = path.resolve(root, path.basename(storagePath));
    if (fullPath.startsWith(root + path.sep) && fs.existsSync(fullPath)) {
      try {
        fs.chmodSync(fullPath, 0o644);
      } catch {
        // ignore
      }
      fs.unlinkSync(fullPath);
    }
  } catch {
    // best effort cleanup on failed DB commit
  }
}
