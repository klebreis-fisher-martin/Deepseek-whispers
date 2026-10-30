/**
 * 把台词送进桌宠自己的气泡。
 *
 * 桌面宠物世界内部有 `say({ script })`,但它没有对其它 World 开放的入口,
 * 也没有公开的 HTTP 路由。这里在同一个 Core 进程里加载应用自带的
 * `cortico-world-desktop-pet/src/index.ts`(与 core/companion.ts 解析到同一份
 * ESM 模块),给 `DesktopPetWorld.prototype` 的几个入口套一层捕获:应用一调用
 * 就记住那个实例,之后直接调用它的 say。stop() 时全部还原。
 *
 * 这是运行时桥接,不改 Coopanion 的任何文件;代价是版本升级后要跟着适配。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface PetBubbleSink {
  attach(): Promise<boolean>;
  detach(): void;
  connected(): boolean;
  say(script: string): Promise<boolean>;
}

/** 只依赖用到的那几个成员,不 import 桌面宠物包(它在 Coopanion 的 app 目录里)。 */
interface PetInstance {
  server?: { petConnected?: boolean };
  petConnected?: boolean;
  say?: (args: { script: string }) => unknown;
}

interface Patch {
  proto: Record<string, unknown>;
  name: string;
  original: (...args: never[]) => unknown;
  wrapper: (...args: never[]) => unknown;
}

const PATCH_MARK = Symbol.for('cortico-world-feiyu-whispers.bridge');

export interface DesktopPetBridgeOptions {
  /** Core 代码根目录;Coopanion 里是 <app>/build/cortico。 */
  repoRoot: string;
  log?: (message: string) => void;
  /** 摸头/戳/甩/放下会立刻从这里通知,不用等事件被投递后才看到。 */
  onTouch?: (kind: string) => void;
}

export class DesktopPetBridge implements PetBubbleSink {
  private pet: PetInstance | null = null;
  private patches: Patch[] = [];
  private attaching: Promise<boolean> | null = null;

  constructor(private readonly opts: DesktopPetBridgeOptions) {}

  attach(): Promise<boolean> {
    if (this.pet) return Promise.resolve(true);
    if (!this.attaching) this.attaching = this.doAttach();
    return this.attaching;
  }

  detach(): void {
    const proto = this.patches[0]?.proto;
    for (const patch of this.patches) {
      // 只还原仍是自己套的那层;别的插件后来改过就别动它。
      if (patch.proto[patch.name] === patch.wrapper) patch.proto[patch.name] = patch.original;
    }
    if (proto) delete (proto as Record<symbol, unknown>)[PATCH_MARK];
    this.patches = [];
    this.pet = null;
    this.attaching = null;
  }

  connected(): boolean {
    const pet = this.pet;
    if (!pet) return false;
    if (typeof pet.server?.petConnected === 'boolean') return pet.server.petConnected;
    return pet.petConnected === true;
  }

  async say(script: string): Promise<boolean> {
    const pet = this.pet;
    if (!pet || typeof pet.say !== 'function') return false;
    if (!this.connected()) return false;
    try {
      await pet.say({ script });
      return true;
    } catch (error) {
      this.opts.log?.(`气泡注入失败:${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private async doAttach(): Promise<boolean> {
    const entry = findDesktopPetEntry(this.opts.repoRoot);
    if (!entry) {
      this.opts.log?.('找不到 cortico-world-desktop-pet(桌面宠物世界);语录暂时只能记录,不会显示。');
      return false;
    }
    let module: { DesktopPetWorld?: { prototype: Record<string, unknown> } };
    try {
      module = (await import(pathToFileURL(entry).href)) as typeof module;
    } catch (error) {
      this.opts.log?.(`加载桌面宠物模块失败:${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
    const ctor = module.DesktopPetWorld;
    if (!ctor) {
      this.opts.log?.('桌面宠物模块里没有 DesktopPetWorld。');
      return false;
    }
    const proto = ctor.prototype as Record<string, unknown> & { [PATCH_MARK]?: true };
    if (proto[PATCH_MARK]) return false;

    for (const name of ['snapshot', 'onPage', 'onTouch', 'envPromptVars', 'petState', 'start'] as const) {
      const original = proto[name];
      if (typeof original !== 'function') continue;
      const bridge = this;
      const wrapper = function (this: unknown, ...args: unknown[]): unknown {
        bridge.capture(this);
        const result = (original as (...a: unknown[]) => unknown).apply(this, args);
        // 页面侧的摸头/戳/甩/放下在默认模式下原本是 piggyback 事件,
        // 要等下一次投递才进事件库;这里当场记下来,气泡才能立即响应。
        if (name === 'onTouch') bridge.touch(this, args[0]);
        return result;
      };
      proto[name] = wrapper;
      this.patches.push({
        proto,
        name,
        original: original as (...args: never[]) => unknown,
        wrapper: wrapper as (...args: never[]) => unknown,
      });
    }
    if (!this.patches.length) return false;
    proto[PATCH_MARK] = true;
    return true;
  }

  private capture(value: unknown): void {
    const candidate = value as PetInstance | null;
    if (!candidate || typeof candidate !== 'object') return;
    if (typeof candidate.say !== 'function') return;
    // 应用只创建一个宠物实例;后到的 snapshot 等调用不要把引用换掉。
    if (!this.pet) this.pet = candidate;
  }

  /** 桌宠页面的互动消息:只转发真正会生成「互动事件」的四种。 */
  private touch(pet: unknown, msg: unknown): void {
    const enabled = (pet as { cfg?: { touch?: { enabled?: boolean } } } | null)?.cfg?.touch?.enabled;
    if (enabled === false) return;
    const kind = (msg as { kind?: unknown } | null)?.kind;
    if (typeof kind !== 'string') return;
    if (kind !== 'poke' && kind !== 'pet' && kind !== 'throw' && kind !== 'drop') return;
    this.opts.onTouch?.(kind);
  }
}

/** 按 Core 代码根、进程入口和可选的 COOPANION_APP_ROOT 找到桌面宠物包源码。 */
export function findDesktopPetEntry(repoRoot: string): string | null {
  const roots = new Set<string>();
  const add = (dir: string | null | undefined): void => {
    if (!dir) return;
    try {
      roots.add(resolve(dir));
    } catch {
      /* 无效路径直接跳过 */
    }
  };
  add(repoRoot);
  add(resolve(repoRoot, '..', '..'));
  add(process.env.COOPANION_APP_ROOT);
  const entryScript = process.argv[1];
  if (entryScript) add(dirname(dirname(entryScript)));
  add(resolve(repoRoot, '..'));

  for (const root of roots) {
    const dir = join(root, 'node_modules', 'cortico-world-desktop-pet');
    const packageFile = join(dir, 'package.json');
    if (!existsSync(packageFile)) continue;
    let main = './src/index.ts';
    try {
      const pkg = JSON.parse(readFileSync(packageFile, 'utf8')) as { main?: unknown };
      if (typeof pkg.main === 'string' && pkg.main) main = pkg.main;
    } catch {
      /* 用默认入口 */
    }
    const entry = resolve(dir, main);
    if (existsSync(entry)) return entry;
  }
  return null;
}