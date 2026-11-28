import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const repo = 'Aigooz/BearLab-Mobile';
const tag = process.argv[2];
if (!tag) throw new Error('Specify the release tag, for example: node tests/verify-release.mjs v1.1.2');
const localApk = process.argv[3];
const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest?verify=${Date.now()}`, {
  headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'BearLab-release-verification', 'X-GitHub-Api-Version': '2022-11-28' }
});
assert.equal(response.status, 200, 'GitHub latest release is unavailable');
const release = await response.json();
assert.equal(release.tag_name, tag);
assert.equal(release.draft, false);
assert.equal(release.prerelease, false);
const asset = release.assets.find(item => item.name === 'BearLab-AI-release.apk');
assert.ok(asset, 'APK missing');
assert.equal(asset.state, 'uploaded');
assert.equal(asset.browser_download_url, `https://github.com/${repo}/releases/download/${tag}/BearLab-AI-release.apk`);
if (localApk) {
  const bytes = await readFile(localApk);
  assert.equal(asset.size, bytes.length);
  assert.equal(asset.digest, 'sha256:' + createHash('sha256').update(bytes).digest('hex'));
}
const download = await fetch(asset.browser_download_url);
assert.equal(download.status, 200, 'public download unavailable');
const downloaded = Buffer.from(await download.arrayBuffer());
assert.equal(asset.size, downloaded.length, 'Release metadata size differs from the downloaded APK');
const digest = 'sha256:' + createHash('sha256').update(downloaded).digest('hex');
assert.equal(digest, asset.digest);
const checksumAsset = release.assets.find(item => item.name === 'BearLab-AI-release.apk.sha256');
assert.ok(checksumAsset, 'SHA-256 sidecar missing');
const checksumResponse = await fetch(checksumAsset.browser_download_url);
assert.equal(checksumResponse.status, 200, 'SHA-256 sidecar unavailable');
const checksum = (await checksumResponse.text()).trim().split(/\s+/)[0].toLowerCase();
assert.equal('sha256:' + checksum, digest);
console.log(`Public release ${tag}: APK metadata, SHA-256 and download verified`);
