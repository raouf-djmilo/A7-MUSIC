#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const distDir = path.resolve(process.argv[2] || 'dist-ota');
const outRoot = path.resolve(process.argv[3] || 'ota-out');
const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
const expoConfig = appJson.expo;
const appVersion = expoConfig.version || '1.6.5';
const runtimeVersion = String(expoConfig.runtimeVersion || appVersion);

const metadataPath = path.join(distDir, 'metadata.json');
if (!fs.existsSync(metadataPath)) {
  console.error('❌ Missing metadata.json at', metadataPath);
  process.exit(1);
}
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
const iosMeta = metadata?.fileMetadata?.ios;
if (!iosMeta || !iosMeta.bundle) {
  console.error('❌ No iOS bundle found in metadata.json');
  process.exit(1);
}

const MIME_MAP = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  json: 'application/json',
  js: 'application/javascript',
  hbc: 'application/javascript',
};

function toBase64UrlSha256(buf) {
  return crypto
    .createHash('sha256')
    .update(buf)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function toMd5Hex(buf) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

function deterministicUuid(seed) {
  const hex = crypto.createHash('sha256').update(seed).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '4' + hex.slice(13, 16),
    ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') + hex.slice(18, 20),
    hex.slice(20, 32),
  ].join('-');
}

function copyFilePreservingRel(relPath, destBase) {
  const cleanRel = relPath.replace(/^\.?\//, '');
  const src = path.join(distDir, cleanRel);
  const dst = path.join(destBase, cleanRel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return { src, dst, cleanRel: cleanRel.replace(/\\/g, '/') };
}

const runtimeDir = path.join(outRoot, 'ota', 'ios', runtimeVersion);
fs.mkdirSync(runtimeDir, { recursive: true });

// 1. Copy and hash iOS launch bundle
const bundleCopied = copyFilePreservingRel(iosMeta.bundle, runtimeDir);
const bundleBuf = fs.readFileSync(bundleCopied.src);
const bundleHash = toBase64UrlSha256(bundleBuf);
const bundleKey = toMd5Hex(bundleBuf);

const launchAsset = {
  hash: bundleHash,
  key: bundleKey,
  contentType: 'application/javascript',
  fileExtension: '.bundle',
  url: `./${bundleCopied.cleanRel}`,
};

// 2. Copy and hash all iOS assets
const assets = (iosMeta.assets || []).map((assetMeta) => {
  const copied = copyFilePreservingRel(assetMeta.path, runtimeDir);
  const buf = fs.readFileSync(copied.src);
  const ext = (assetMeta.ext || '').replace(/^\./, '').toLowerCase();
  return {
    hash: toBase64UrlSha256(buf),
    key: toMd5Hex(buf),
    contentType: MIME_MAP[ext] || 'application/octet-stream',
    fileExtension: ext ? `.${ext}` : '.bin',
    url: `./${copied.cleanRel}`,
  };
});

const nowIso = new Date().toISOString();
const commitSha = (process.env.GITHUB_SHA || 'local').slice(0, 7);
let commitTitle = process.env.OTA_TITLE || '';
if (!commitTitle) {
  try {
    commitTitle = execSync('git log -1 --pretty=%s', { encoding: 'utf8' }).trim();
  } catch {
    commitTitle = `تحديث سريع A7 MUSIC (${commitSha})`;
  }
}

const customHighlightsRaw = process.env.OTA_HIGHLIGHTS || '';
const highlights = customHighlightsRaw
  ? customHighlightsRaw.split('|').map((s) => s.trim()).filter(Boolean)
  : [
      commitTitle,
      'تحديث مباشر فوري عبر GitHub Pages بدون إعادة تثبيت التطبيق',
      'تحسينات في الأداء واستقرار تشغيل الموسيقى على iOS',
    ];

const updateId = deterministicUuid(`${runtimeVersion}:${bundleHash}:${nowIso}`);
const otaVersion = process.env.OTA_VERSION || `${appVersion}-ota.${commitSha}`;

// Build public expoClient config safely
let publicExpoClient = expoConfig;
try {
  const out = execSync('npx expo config --type public --json', { encoding: 'utf8' });
  publicExpoClient = JSON.parse(out);
} catch {}

const manifest = {
  id: updateId,
  createdAt: nowIso,
  runtimeVersion,
  launchAsset,
  assets,
  metadata: {},
  extra: {
    expoClient: publicExpoClient,
    a7Update: {
      otaVersion,
      appVersion,
      runtimeVersion,
      commitSha,
      title: commitTitle,
      highlights,
      publishedAt: nowIso,
      bundleSizeBytes: bundleBuf.length,
    },
  },
};

const manifestOutPath = path.join(runtimeDir, 'manifest.json');
fs.writeFileSync(manifestOutPath, JSON.stringify(manifest, null, 2), 'utf8');

// 3. Write latest.json at ota/ios/latest.json for native version checking
const repoOwner = process.env.GITHUB_REPOSITORY_OWNER || 'raouf-djmilo';
const repoName = (process.env.GITHUB_REPOSITORY || 'raouf-djmilo/A7-MUSIC').split('/')[1] || 'A7-MUSIC';
const latestMeta = {
  platform: 'ios',
  latestNativeVersion: appVersion,
  runtimeVersion,
  otaVersion,
  updateId,
  publishedAt: nowIso,
  title: commitTitle,
  highlights,
  bundleSizeBytes: bundleBuf.length,
  manifestUrl: `https://${repoOwner}.github.io/${repoName}/ota/ios/${runtimeVersion}/manifest.json`,
  ipaUrl: `https://github.com/${repoOwner}/${repoName}/releases/latest/download/A7-MUSIC.ipa`,
  releasesPageUrl: `https://github.com/${repoOwner}/${repoName}/releases`,
};

const iosRoot = path.join(outRoot, 'ota', 'ios');
fs.mkdirSync(iosRoot, { recursive: true });
fs.writeFileSync(path.join(iosRoot, 'latest.json'), JSON.stringify(latestMeta, null, 2), 'utf8');

// 4. Write simple status page at root
const indexHtml = `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>A7 MUSIC iOS OTA Server</title></head>
<body style="font-family:-apple-system,system-ui,sans-serif;background:#0a0a0a;color:#fff;padding:40px;max-width:640px;margin:auto;">
  <h1>🎵 A7 MUSIC — iOS Fast OTA Server</h1>
  <p>Runtime Version: <strong>${runtimeVersion}</strong></p>
  <p>OTA Version: <strong>${otaVersion}</strong></p>
  <p>Update ID: <code>${updateId}</code></p>
  <p>Bundle Size: <strong>${(bundleBuf.length / (1024 * 1024)).toFixed(2)} MB</strong></p>
  <p>Published: ${nowIso}</p>
</body>
</html>`;
fs.writeFileSync(path.join(outRoot, 'index.html'), indexHtml, 'utf8');

console.log(`✅ Generated iOS OTA manifest: ${manifestOutPath}`);
console.log(`   Update ID: ${updateId}`);
console.log(`   Runtime: ${runtimeVersion} | Bundle: ${(bundleBuf.length / (1024 * 1024)).toFixed(2)} MB | Assets: ${assets.length}`);
