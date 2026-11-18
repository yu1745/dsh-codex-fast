import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { installAdapterSpeed, speedStore } from '../index.js';
import { remoteInfo } from '../src/remote.js';

 test('persists modes and inherits only into new children', t => {
  const directory = mkdtempSync(join(tmpdir(), 'codex-fast-'));
  t.after(() => rmSync(directory, { recursive: true }));
  const store = speedStore(directory);
  assert.equal(store.read('parent'), 'standard');
  store.write('parent', 'fast');
  store.inherit('child', 'parent');
  store.write('parent', 'standard');
  store.inherit('child', 'parent');
  assert.equal(speedStore(directory).read('child'), 'fast');
  assert.throws(() => store.write('../other', 'fast'), /Invalid/);
});

test('sets priority only for Codex and preserves the prior payload hook', async () => {
  const prototype = { streamWithSnapshot(_, snapshot) { return snapshot.models.streamSimple(null, null, {
    onPayload: payload => ({ ...payload, existing: true }),
  }); } };
  const adapter = Object.create(prototype);
  const snapshot = { models: { streamSimple(_, __, options) { return options.onPayload({ model: 'codex' }); } } };
  const dispose = installAdapterSpeed(adapter, { read: () => 'fast' });
  assert.deepEqual(await adapter.streamWithSnapshot({ provider: 'openai-codex' }, snapshot), {
    model: 'codex', existing: true, service_tier: 'priority',
  });
  assert.deepEqual(adapter.streamWithSnapshot({ provider: 'deepseek' }, snapshot), { model: 'codex', existing: true });
  dispose();
  assert.equal(adapter.streamWithSnapshot, prototype.streamWithSnapshot);
});

test('compiled client registers the Codex-only model options slot', async () => {
  let definition;
  runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load(value) { definition = value; } } },
  });
  const client = definition.factory(name => {
    assert.equal(name, 'react');
    return { createElement: (type, props) => ({ type, props }), useSyncExternalStore: (_, read) => read() };
  });
  const name = 'yuStandaloneCodexSpeed';
  let item;
  const api = {};
  const ctx = {
    effect: callback => callback(), locale: { register() {} },
    remote: { [name]: api, $mount(info) { assert.equal(info.descriptors[0].id, remoteInfo.descriptors[0].id); } },
    inject: (_, callback) => callback(ctx),
    slots: {
      inject(slot, callback) { assert.equal(slot, 'conversation.input.model.options'); callback(); },
      register(options, component) { item = { options, component }; },
    },
  };
  await client.apply(ctx);
  assert.equal(item.options.name, 'conversation.input.model.options');
  function render(current) {
    return item.component({ sessionId: 's1', api, directory: { subscribe() {}, getSnapshot: () => ({ current }) } });
  }
  assert.equal(render({ provider: 'deepseek' }), null);
  assert.equal(render({ provider: 'magpie-responses', model: 'codex/gpt' }).props.sessionId, 's1');
  assert.equal(render({ provider: 'openai-codex' }).props.api, api);
});
