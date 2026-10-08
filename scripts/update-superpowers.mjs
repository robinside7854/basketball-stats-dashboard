#!/usr/bin/env node
// superpowers 스킬을 upstream(https://github.com/obra/superpowers) 최신으로 다시 복사한다.
// 사용: node scripts/update-superpowers.mjs
// 하는 일: 임시 폴더에 upstream 을 clone → skills/* 를 .claude/skills/ 에 덮어쓰기 → 커밋 해시를 기록.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = 'https://github.com/obra/superpowers.git';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dest = path.join(root, '.claude', 'skills');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'superpowers-'));

execSync(`git clone --depth 1 ${REPO} "${tmp}"`, { stdio: 'inherit' });
const sha = execSync('git rev-parse HEAD', { cwd: tmp, encoding: 'utf8' }).trim();
const version = JSON.parse(fs.readFileSync(path.join(tmp, '.claude-plugin', 'plugin.json'), 'utf8')).version;

const names = fs.readdirSync(path.join(tmp, 'skills'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
for (const n of names) {
  fs.rmSync(path.join(dest, n), { recursive: true, force: true });
  fs.cpSync(path.join(tmp, 'skills', n), path.join(dest, n), { recursive: true });
}

const note = path.join(dest, 'SUPERPOWERS-UPSTREAM.md');
let md = fs.readFileSync(note, 'utf8');
md = md.replace(/복사한 upstream 커밋: `[0-9a-f]+` \(v[^,]+, \d{4}-\d{2}-\d{2}\)/, `복사한 upstream 커밋: \`${sha}\` (v${version}, ${new Date().toISOString().slice(0, 10)})`);
fs.writeFileSync(note, md);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n✔ superpowers v${version} (${sha.slice(0, 7)}) → ${names.length}개 스킬 갱신: ${names.join(', ')}`);
console.log('이제 git diff 를 확인하고 커밋·push 하면 된다.');
