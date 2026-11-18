import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { remoteInfo } from './src/remote.js';
import { isCodex, remoteName } from './src/shared.js';

export const inject = ['llm', 'typert'];

export function speedStore(directory = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'extensions', 'yu1745', 'speeds')) {
  function file(id) {
    if (typeof id !== 'string' || !/^[\w-]{1,200}$/.test(id)) throw new Error('Invalid session ID');
    return join(directory, `${id}.json`);
  }
  function load(id) {
    if (!id) return undefined;
    try {
      return JSON.parse(readFileSync(file(id), 'utf8'))?.mode;
    } catch (error) {
      if (error.code === 'ENOENT' || error instanceof SyntaxError) return undefined;
      throw error;
    }
  }
  function read(id) {
    const mode = load(id);
    return mode === 'fast' || mode === 'ultrafast' ? mode : 'standard';
  }
  function write(id, mode) {
    const path = file(id);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify({ mode }), { mode: 0o600 });
    renameSync(temporary, path);
    return { mode };
  }
  return { read, write, inherit: (id, parent) => {
    if (parent && load(id) === undefined) write(id, read(parent));
  } };
}

export function installAdapterSpeed(adapter, store) {
  const original = adapter.streamWithSnapshot;
  const descriptor = Object.getOwnPropertyDescriptor(adapter, 'streamWithSnapshot');
  let active = true;
  function stream(options, snapshot) {
    if (!active || !isCodex(options)) return original.call(this, options, snapshot);
    const mode = store.read(options.sessionId);
    if (mode === 'standard') return original.call(this, options, snapshot);
    const tier = mode === 'fast' ? 'priority' : 'ultrafast';
    const models = new Proxy(snapshot.models, {
      get(target, key) {
        if (key === 'streamSimple') return (model, context, streamOptions) =>
          target.streamSimple(model, context, {
            ...streamOptions,
            serviceTier: tier,
            async onPayload(payload, payloadModel) {
              const updated = await streamOptions?.onPayload?.(payload, payloadModel);
              return { ...(updated ?? payload), service_tier: tier };
            },
          });
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return original.call(this, options, { ...snapshot, models });
  }
  adapter.streamWithSnapshot = stream;
  return () => {
    active = false;
    if (adapter.streamWithSnapshot !== stream) return;
    if (descriptor) Object.defineProperty(adapter, 'streamWithSnapshot', descriptor);
    else delete adapter.streamWithSnapshot;
  };
}

export function apply(ctx) {
  const store = speedStore();
  class CodexSpeed extends TypertRemoteService {
    constructor() { super(ctx, remoteName); }
    speed(id) { return { mode: store.read(id) }; }
    setFast(id, enabled) { return store.write(id, enabled ? 'fast' : 'standard'); }
  }
  new CodexSpeed();
  ctx.effect(() => ctx.typert.register({
    package: remoteInfo.package, face: 'host', schemas: [], invocations: remoteInfo.descriptors,
    model: { services: [], events: [], objects: [] },
  }));
  const adapters = new Map();
  function refresh() {
    const current = new Set([...ctx.llm.adapters.values()].map(({ adapter }) => adapter));
    for (const [adapter, dispose] of adapters) {
      if (!current.has(adapter)) { dispose(); adapters.delete(adapter); }
    }
    for (const adapter of current) {
      if (!adapters.has(adapter) && typeof adapter.streamWithSnapshot === 'function') {
        adapters.set(adapter, installAdapterSpeed(adapter, store));
      }
    }
  }
  ctx.on('llm/adapters-updated', refresh);
  ctx.on('dispose', () => { for (const dispose of adapters.values()) dispose(); });
  ctx.on('session/created', session => store.inherit(session.id, session.header.parentSession));
  refresh();
  ctx.inject(['commands'], scope => {
    for (const mode of ['fast', 'ultrafast']) scope.commands.register({
      name: mode,
      description: `Toggle the session’s Codex ${mode} mode.`,
      async handler({ agent }) {
        const id = agent.session.id;
        const next = store.read(id) === mode ? 'standard' : mode;
        store.write(id, next);
        return { kind: 'success', text: `Codex speed: ${next}` };
      },
    });
  });
}
