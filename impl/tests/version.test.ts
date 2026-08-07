/** VER · một nguồn duy nhất cho số phiên bản (§16). */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/app';
const VERSION = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim();

describe('VER-04 · chỉ file VERSION giữ số phiên bản', () => {
  it('VERSION đúng dạng semver', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('mọi package.json đều để version 0.0.0 — tránh nguồn sự thật thứ hai', () => {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name === 'package.json') {
          const v = JSON.parse(readFileSync(p, 'utf8')).version;
          if (v !== undefined && v !== '0.0.0') found.push(`${p} = ${v}`);
        }
      }
    };
    walk(ROOT);
    expect(found).toEqual([]);
  });
});

describe('VER-01 · số phiên bản tới được tiến trình đang chạy', () => {
  it('APP_VERSION được truyền vào container', () => {
    expect(process.env.APP_VERSION).toBeDefined();
    expect(process.env.APP_VERSION).not.toBe('');
  });
});
