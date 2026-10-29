// -----------------------------------------------------------------------------
// The daily records of the watched counters, kept in /data/records.json so a
// restart neither asks the portals again nor fires a record twice:
//
//   { "<device external id>": { "day": "2026-04-16", "count": 3145, "upTo": "2026-10-27" } }
//
// `upTo` is the last day already compared. Writing is best effort: without a
// writable /data the records live in memory (said once in the logs).
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'compteurs-velo' });

export class RecordStore {
  /** @param {string|null} dir null keeps everything in memory (tests) */
  constructor(dir) {
    this.file = dir ? path.join(dir, 'records.json') : null;
    this.records = {};
    this.failed = false;
  }

  async load() {
    if (!this.file) {
      return;
    }
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'));
      this.records = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(`Cannot read the saved records, starting afresh: ${err.message}`);
      }
      this.records = {};
    }
  }

  get(id) {
    const record = this.records[id];
    return record && Number.isFinite(record.count) && typeof record.upTo === 'string'
      ? record
      : null;
  }

  async set(id, record) {
    this.records[id] = record;
    await this.save();
  }

  /** Forgets the counters no longer watched. */
  async keep(ids) {
    const wanted = new Set(ids);
    const stale = Object.keys(this.records).filter((id) => !wanted.has(id));
    if (stale.length === 0) {
      return;
    }
    for (const id of stale) {
      delete this.records[id];
    }
    await this.save();
  }

  async save() {
    if (!this.file) {
      return;
    }
    try {
      await mkdir(path.dirname(this.file), { recursive: true });
      const temporary = `${this.file}.tmp`;
      await writeFile(temporary, JSON.stringify(this.records));
      await rename(temporary, this.file);
      if (this.failed) {
        this.failed = false;
        logger.info('Records saved again');
      }
    } catch (err) {
      if (!this.failed) {
        logger.warn(`Cannot save the records (kept in memory): ${err.message}`);
      }
      this.failed = true;
    }
  }
}
