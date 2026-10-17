const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  MAX_PROJECT_BYTES,
  canonicalPath,
  safeProjectStem,
  assertProjectJson,
  atomicWrite
} = require('../electron/project-store.cjs');

test('projectvalidator accepteert geldige Fluxivora-projecten en weigert ongeldige inhoud', () => {
  const valid = '{"format":"fluxivora-project","name":"Testontwerp"}';
  assert.deepEqual(assertProjectJson(valid), { format: 'fluxivora-project', name: 'Testontwerp' });
  assert.throws(() => assertProjectJson('{kapot'), /geen geldige JSON/);
  assert.throws(() => assertProjectJson('{"format":"anders"}'), /geen geldig Fluxivora-projectbestand/);
  assert.throws(() => assertProjectJson(valid, 8), /te groot of ongeldig/);
  assert.equal(MAX_PROJECT_BYTES, 180 * 1024 * 1024);
});

test('bestandsnamen worden veilig gemaakt voor Windows en krijgen een bruikbare terugvalnaam', () => {
  assert.equal(safeProjectStem('Mijn: ontwerp/2026?'), 'Mijn ontwerp2026');
  assert.equal(safeProjectStem('..  '), 'Mijn ontwerp');
  assert.equal(safeProjectStem(''), 'Mijn ontwerp');
  assert.ok(safeProjectStem('x'.repeat(100)).length <= 80);
  assert.equal(safeProjectStem('A\u0000B\u0007C'), 'ABC');
});

test('canonicalPath normaliseert relatieve padsegmenten', () => {
  const resolved = path.resolve('folder', '..', 'ontwerp.fluxivora');
  const actual = canonicalPath(path.join('folder', '..', 'ontwerp.fluxivora'));
  assert.equal(actual, process.platform === 'win32' ? resolved.toLocaleLowerCase('en-US') : resolved);
});

test('atomicWrite schrijft en vervangt bestanden veilig en gebruikt unieke tijdelijke namen', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fluxivora-store-'));
  try {
    const destination = path.join(directory, 'project.fluxivora');
    await atomicWrite(destination, 'eerste versie', { encoding: 'utf8' });
    assert.equal(await fs.readFile(destination, 'utf8'), 'eerste versie');

    const candidates = ['versie-A', 'versie-B', 'versie-C'];
    await Promise.all(candidates.map(value => atomicWrite(destination, value, { encoding: 'utf8' })));
    assert.ok(candidates.includes(await fs.readFile(destination, 'utf8')));
    assert.deepEqual(await fs.readdir(directory), ['project.fluxivora']);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('atomicWrite ruimt een tijdelijk bestand op als vervanging mislukt', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fluxivora-store-failure-'));
  try {
    const destination = path.join(directory, 'existing-directory');
    await fs.mkdir(destination);
    await fs.writeFile(path.join(destination, 'keep.txt'), 'bestaande inhoud', 'utf8');
    await assert.rejects(atomicWrite(destination, 'dit moet mislukken', { encoding: 'utf8' }));
    assert.equal(await fs.readFile(path.join(destination, 'keep.txt'), 'utf8'), 'bestaande inhoud');
    assert.deepEqual(await fs.readdir(directory), ['existing-directory']);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
