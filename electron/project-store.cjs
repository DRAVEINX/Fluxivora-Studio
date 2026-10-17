'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MAX_PROJECT_BYTES = 180 * 1024 * 1024;

function canonicalPath(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLocaleLowerCase('en-US') : resolved;
}

function safeProjectStem(value) {
  const invalidCharacters = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);
  const cleaned = [...String(value || 'Mijn ontwerp')]
    .filter(character => !invalidCharacters.has(character) && character.charCodeAt(0) >= 0x20)
    .join('')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 80);
  return cleaned || 'Mijn ontwerp';
}

function assertProjectJson(json, maxBytes = MAX_PROJECT_BYTES) {
  if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > maxBytes) {
    throw new Error('Het projectbestand is te groot of ongeldig.');
  }
  let project;
  try {
    project = JSON.parse(json);
  } catch (_) {
    throw new Error('Het projectbestand bevat geen geldige JSON.');
  }
  if (!project || Array.isArray(project) || project.format !== 'fluxivora-project') {
    throw new Error('Dit is geen geldig Fluxivora-projectbestand.');
  }
  return project;
}

async function atomicWrite(filePath, data, options = {}) {
  // UUIDs make temporary filenames unique even if multiple autosave operations
  // happen within the same millisecond.
  const tempPath = `${filePath}.fluxivora-${process.pid}-${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tempPath, data, options);
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => {});
    throw error;
  }
}

module.exports = {
  MAX_PROJECT_BYTES,
  canonicalPath,
  safeProjectStem,
  assertProjectJson,
  atomicWrite
};
