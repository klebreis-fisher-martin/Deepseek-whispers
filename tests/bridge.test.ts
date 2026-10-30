import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DesktopPetBridge, findDesktopPetEntry } from '../src/bridge.ts';

let root: string;
let entry: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'feiyu-bridge-'));
  const pkgDir = join(root, 'node_modules', 'cortico-world-desktop-pet');
  mkdirSync(join(pkgDir, 'src'), { recursive: true });
  writeFileSync(
    join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'cortico-world-desktop-pet', main: './src/index.js' }),
    'utf8',
  );
  entry = join(pkgDir, 'src', 'index.js');
  writeFileSync(
    entry,
    [
      'export class DesktopPetWorld {',
      '  constructor() { this.server = { petConnected: true }; this.said = []; }',
      "  snapshot() { return 'snap'; }",
      "  onPage() { return 'page'; }",
      '  envPromptVars() { return {}; }',
      '  petState() { return {}; }',
      "  start() { return 'started'; }",
      '  async say(args) { this.said.push(args.script); return "ok"; }',
      '}',
    ].join('\n'),
    'utf8',
  );
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('桌宠气泡桥', () => {
  it('能找到应用自带的桌面宠物包入口', () => {
    expect(findDesktopPetEntry(root)).toBe(entry);
  });

  it('套上入口后捕获实例,并能调用 say;stop 后原型还原', async () => {
    const { DesktopPetWorld } = await import(pathToFileURL(entry).href);
    const originalSnapshot = DesktopPetWorld.prototype.snapshot;
    const bridge = new DesktopPetBridge({ repoRoot: root });

    expect(await bridge.attach()).toBe(true);
    expect(bridge.connected()).toBe(false);

    const pet = new DesktopPetWorld();
    expect(pet.snapshot()).toBe('snap');
    expect(bridge.connected()).toBe(true);
    expect(await bridge.say('【害羞】想把老大配了')).toBe(true);
    expect(pet.said).toEqual(['【害羞】想把老大配了']);

    bridge.detach();
    expect(DesktopPetWorld.prototype.snapshot).toBe(originalSnapshot);
    expect(await bridge.say('还会说吗')).toBe(false);
  });

  it('桌宠页面没连上就不注入', async () => {
    const { DesktopPetWorld } = await import(pathToFileURL(entry).href);
    const bridge = new DesktopPetBridge({ repoRoot: root });
    await bridge.attach();
    const pet = new DesktopPetWorld();
    pet.server.petConnected = false;
    pet.onPage();
    expect(bridge.connected()).toBe(false);
    expect(await bridge.say('不该出现')).toBe(false);
    expect(pet.said).toEqual([]);
    bridge.detach();
  });

  it('找不到包时 fail-soft,不抛错', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'feiyu-empty-'));
    const bridge = new DesktopPetBridge({ repoRoot: empty });
    expect(findDesktopPetEntry(empty)).toBeNull();
    expect(await bridge.attach()).toBe(false);
    expect(bridge.connected()).toBe(false);
    expect(await bridge.say('hi')).toBe(false);
    rmSync(empty, { recursive: true, force: true });
  });
});