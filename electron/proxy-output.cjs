'use strict';

const fs = require('node:fs/promises');
const { constants: fsConstants } = require('node:fs');
const path = require('node:path');
const { safeFileStem } = require('./video-render.cjs');

async function commitUniqueProxyOutput(partialPath, directoryPath, sourceName, preset) {
  if (typeof partialPath !== 'string' || !partialPath.trim() ||
      typeof directoryPath !== 'string' || !path.isAbsolute(directoryPath) ||
      typeof preset !== 'string' || !/^[a-z0-9-]{1,32}$/i.test(preset)) {
    throw new TypeError('Ongeldige proxy-uitvoerinstellingen.');
  }
  const parsed = path.parse(String(sourceName || 'Fluxivora-video'));
  const stem = safeFileStem(parsed.name || sourceName || 'Fluxivora-video').slice(0, 72);
  const base = stem + '.proxy-' + preset;

  for (let index = 1; index <= 1000; index++) {
    const filename = base + (index === 1 ? '' : '-' + index) + '.mp4';
    const candidate = path.join(directoryPath, filename);
    try {
      // Exclusive copy claims the destination atomically. Existing or concurrent
      // exports are never replaced, even when two jobs choose the same base name.
      await fs.copyFile(partialPath, candidate, fsConstants.COPYFILE_EXCL);
      // The committed output is valid now; failure to clean the temporary file
      // must not turn a successful commit into a reported failed export.
      await fs.rm(partialPath, { force: true }).catch(() => {});
      return { filePath: candidate, filename };
    } catch (error) {
      if (error?.code === 'EEXIST') continue;
      throw error;
    }
  }
  throw new Error('Er kunnen geen unieke proxybestandsnamen meer worden gemaakt in deze map.');
}

module.exports = Object.freeze({ commitUniqueProxyOutput });
