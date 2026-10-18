'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { commitUniqueProxyOutput } = require('../electron/proxy-output.cjs');

async function withTempDirectory(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fluxivora-proxy-test-'));
  try {
    await run(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test('proxy output preserves existing files and chooses the next unique name', async () => {
  await withTempDirectory(async directory => {
    const existing = path.join(directory, 'clip.proxy-720p.mp4');
    const partial = path.join(directory, '.one.partial.mp4');
    await fs.writeFile(existing, 'existing proxy');
    await fs.writeFile(partial, 'new proxy');

    const result = await commitUniqueProxyOutput(partial, directory, 'clip.mov', '720p');

    assert.equal(result.filename, 'clip.proxy-720p-2.mp4');
    assert.equal(await fs.readFile(existing, 'utf8'), 'existing proxy');
    assert.equal(await fs.readFile(result.filePath, 'utf8'), 'new proxy');
    await assert.rejects(fs.access(partial));
  });
});

test('concurrent proxy commits get distinct names and preserve both outputs', async () => {
  await withTempDirectory(async directory => {
    const partialA = path.join(directory, '.a.partial.mp4');
    const partialB = path.join(directory, '.b.partial.mp4');
    await Promise.all([
      fs.writeFile(partialA, 'proxy A'),
      fs.writeFile(partialB, 'proxy B')
    ]);

    const results = await Promise.all([
      commitUniqueProxyOutput(partialA, directory, 'clip.mov', '540p'),
      commitUniqueProxyOutput(partialB, directory, 'clip.mov', '540p')
    ]);

    assert.equal(new Set(results.map(result => result.filename)).size, 2);
    assert.deepEqual(
      (await Promise.all(results.map(result => fs.readFile(result.filePath, 'utf8')))).sort(),
      ['proxy A', 'proxy B']
    );
    await Promise.all([partialA, partialB].map(file => assert.rejects(fs.access(file))));
  });
});

test('proxy output rejects invalid presets rather than building unsafe names', async () => {
  await withTempDirectory(async directory => {
    const partial = path.join(directory, '.partial.mp4');
    await fs.writeFile(partial, 'proxy');
    await assert.rejects(
      commitUniqueProxyOutput(partial, directory, 'clip.mov', '../outside'),
      /Ongeldige proxy-uitvoerinstellingen/
    );
    assert.equal(await fs.readFile(partial, 'utf8'), 'proxy');
  });
});
