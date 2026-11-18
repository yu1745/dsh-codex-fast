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

test('compiled client shares confirmed speed between both Codex-only controls', async () => {
  let definition;
  runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), {
    document: { createElement: () => ({}), head: { append() {} } },
    window: { __ModuleLoader__: { load(value) { definition = value; } } },
  });
  const Switch = Symbol('shared switch');
  const client = definition.factory(name => {
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return { Switch };
    assert.equal(name, 'react');
    return { createElement: (type, props, ...children) => ({ type, props, children }), useEffect() {}, useSyncExternalStore: (_, read) => read() };
  });
  const name = 'yuStandaloneCodexSpeed';
  const items = new Map();
  const calls = [];
  const api = {
    speed(id) { calls.push(['read', id]); return { ok: true, value: { mode: 'standard' } }; },
    setFast(id, enabled) { calls.push(['write', id, enabled]); return { ok: true, value: { mode: enabled ? 'fast' : 'standard' } }; },
  };
  let current = { provider: 'deepseek' };
  const ctx = {
    effect: callback => callback(), locale: { register() {} },
    remote: { [name]: api, $mount(info) { assert.equal(info.descriptors[0].id, remoteInfo.descriptors[0].id); } },
    inject: (_, callback) => callback(ctx),
    modelDirectories: { directoryFor() { return { store: { subscribe() {}, getSnapshot: () => ({ current }) } }; } },
    slots: {
      inject(_slot, callback) { callback(); },
      register(options, component) { items.set(options.name, { options, component }); },
    },
  };
  await client.apply(ctx);
  const [menu, dock] = ['conversation.input.model.options', 'conversation.composer.dock'].map(slot => items.get(slot));
  function render(item, id = 's1') {
    return item.component({ sessionId: id, t: key => key, ...item.options.inject(id) });
  }
  assert.equal(render(menu), null);
  assert.equal(render(dock), null);
  current = { provider: 'magpie-responses', model: 'codex/gpt' };
  assert.ok(render(dock));
  current = { provider: 'openai-codex' };
  const menuView = render(menu);
  const dockView = render(dock);
  const state = menuView.props.state;
  assert.equal(dockView.props.state, state);
  assert.notEqual(render(dock, 's2').props.state, state);
  await Promise.all([state.refresh(), dockView.props.state.refresh()]);
  const renderMenu = () => menuView.type(menuView.props).children[1];
  const renderDock = () => dockView.type(dockView.props);
  assert.equal(renderMenu().type, Switch);
  assert.equal(renderMenu().props.checked, false);
  assert.equal(renderDock().props['aria-pressed'], false);
  renderDock().props.onClick();
  assert.equal(renderMenu().props.disabled, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(renderMenu().props.checked, true);
  assert.equal(renderDock().props['aria-pressed'], true);
  renderMenu().props.onChange(false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(renderDock().props['aria-pressed'], false);
  assert.deepEqual(calls, [['read', 's1'], ['write', 's1', true], ['write', 's1', false]]);
});
