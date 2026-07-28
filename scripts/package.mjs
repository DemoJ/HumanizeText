import { spawnSync } from 'node:child_process';
import {
  mkdir,
  readFile,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RELEASE_DIR = path.join(ROOT, 'release');

const PACKAGE_FILES = [
  'background.js',
  'content/content.js',
  'options/options.html',
  'options/options.css',
  'options/options.js',
  'sidepanel/sidepanel.html',
  'sidepanel/sidepanel.css',
  'sidepanel/sidepanel.js',
  'assets/icon.png'
];

const TARGETS = [
  { id: 'chrome', manifestSource: 'manifest.json', label: 'Chrome / Edge' },
  { id: 'firefox', manifestSource: 'manifest-firefox.json', label: 'Firefox' }
];

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`✓ ${message}`);
}

function runBuild() {
  console.log('\n── 1/3 构建 ──');
  const result = spawnSync(process.execPath, [path.join('scripts', 'build.mjs')], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false
  });
  if (result.status !== 0) fail('构建失败');
  ok('background.js 已构建');
}

async function readJson(relPath) {
  const raw = await readFile(path.join(ROOT, relPath), 'utf8');
  return JSON.parse(raw);
}

async function assertExists(relPath) {
  try {
    await stat(path.join(ROOT, relPath));
  } catch {
    fail(`缺少文件: ${relPath}`);
  }
}

async function validateSources() {
  console.log('\n── 2/3 校验源文件 ──');

  const pkg = await readJson('package.json');
  const chromeManifest = await readJson('manifest.json');
  const firefoxManifest = await readJson('manifest-firefox.json');

  if (pkg.version !== chromeManifest.version) {
    fail(
      `版本不一致: package.json=${pkg.version}, manifest.json=${chromeManifest.version}`
    );
  }
  if (pkg.version !== firefoxManifest.version) {
    fail(
      `版本不一致: package.json=${pkg.version}, manifest-firefox.json=${firefoxManifest.version}`
    );
  }
  ok(`版本一致: ${pkg.version}`);

  for (const file of PACKAGE_FILES) {
    await assertExists(file);
  }
  await assertExists('manifest.json');
  await assertExists('manifest-firefox.json');
  ok(`清单文件齐全 (${PACKAGE_FILES.length + 1} 项/目标)`);

  return pkg.version;
}

function crc32Of(buf) {
  if (typeof crc32 === 'function') return crc32(buf) >>> 0;
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

async function createZip(zipPath, entries) {
  const files = [];

  for (const { name, data } of entries) {
    const compressed = deflateRawSync(data, { level: 9 });
    const useStore = compressed.length >= data.length;
    files.push({
      name: name.replace(/\\/g, '/'),
      data,
      compressed: useStore ? data : compressed,
      crc: crc32Of(data),
      method: useStore ? 0 : 8,
      offset: 0
    });
  }

  const { dosTime, dosDate } = toDosDateTime();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const f of files) {
    f.offset = offset;
    const nameBuf = Buffer.from(f.name, 'utf8');

    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(f.method),
      u16(dosTime),
      u16(dosDate),
      u32(f.crc),
      u32(f.compressed.length),
      u32(f.data.length),
      u16(nameBuf.length),
      u16(0),
      nameBuf,
      f.compressed
    ]);
    localParts.push(local);
    offset += local.length;

    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(f.method),
      u16(dosTime),
      u16(dosDate),
      u32(f.crc),
      u32(f.compressed.length),
      u32(f.data.length),
      u16(nameBuf.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(f.offset),
      nameBuf
    ]);
    centralParts.push(central);
  }

  const centralDir = Buffer.concat(centralParts);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.length),
    u32(offset),
    u16(0)
  ]);

  await writeFile(zipPath, Buffer.concat([...localParts, centralDir, end]));
}

async function collectEntries(manifestSource) {
  const entries = [];
  entries.push({
    name: 'manifest.json',
    data: await readFile(path.join(ROOT, manifestSource))
  });
  for (const rel of PACKAGE_FILES) {
    entries.push({
      name: rel.replace(/\\/g, '/'),
      data: await readFile(path.join(ROOT, rel))
    });
  }
  return entries;
}

async function validateZipListing(zipPath, expectedNames) {
  const buf = await readFile(zipPath);
  const names = new Set();
  let i = 0;
  while (i < buf.length - 4) {
    if (buf.readUInt32LE(i) === 0x02014b50) {
      const nameLen = buf.readUInt16LE(i + 28);
      const extraLen = buf.readUInt16LE(i + 30);
      const commentLen = buf.readUInt16LE(i + 32);
      const name = buf.subarray(i + 46, i + 46 + nameLen).toString('utf8');
      names.add(name);
      i += 46 + nameLen + extraLen + commentLen;
      continue;
    }
    i++;
  }

  const missing = expectedNames.filter((n) => !names.has(n));
  const extra = [...names].filter((n) => !expectedNames.includes(n));
  if (missing.length) fail(`${path.basename(zipPath)} 缺少: ${missing.join(', ')}`);
  if (extra.length) fail(`${path.basename(zipPath)} 多余: ${extra.join(', ')}`);
  return names.size;
}

async function packageAll(version) {
  console.log('\n── 3/3 打包 ──');

  await rm(RELEASE_DIR, { recursive: true, force: true });
  await mkdir(RELEASE_DIR, { recursive: true });

  const expectedNames = [
    'manifest.json',
    ...PACKAGE_FILES.map((f) => f.replace(/\\/g, '/'))
  ];
  const outputs = [];

  for (const target of TARGETS) {
    const zipName = `HumanizeText-v${version}-${target.id}.zip`;
    const zipPath = path.join(RELEASE_DIR, zipName);
    const entries = await collectEntries(target.manifestSource);
    await createZip(zipPath, entries);
    const count = await validateZipListing(zipPath, expectedNames);
    const size = (await stat(zipPath)).size;
    ok(`${target.label}: ${zipName} (${count} 文件, ${(size / 1024).toFixed(1)} KB)`);
    outputs.push(zipPath);
  }

  return outputs;
}

async function main() {
  console.log('HumanizeText 发版打包');
  runBuild();
  const version = await validateSources();
  const outputs = await packageAll(version);

  console.log('\n完成。产物:');
  for (const p of outputs) {
    console.log(`  ${path.relative(ROOT, p)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
