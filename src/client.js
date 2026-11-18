import { remoteInfo } from './remote.js';
import { isCodex, packageName, remoteName } from './shared.js';

const slot = 'conversation.input.model.options';
const dictionaries = {
  en: { speed: 'Codex speed', normal: 'Normal', fast: 'Fast', loading: 'Loading Codex speed…', readFailed: 'Could not read Codex speed.', writeFailed: 'Could not change Codex speed.' },
  zh: { speed: 'Codex 速度', normal: '普通', fast: '快速', loading: '正在读取 Codex 速度…', readFailed: '无法读取 Codex 速度。', writeFailed: '无法更改 Codex 速度。' },
};

window.__ModuleLoader__.load({
  id: packageName,
  factory(require) {
    const { createElement: h, useEffect, useId, useRef, useState, useSyncExternalStore } = require('react');

    function SpeedControl({ sessionId, api, locked, reportFailure, t }) {
      const id = useId();
      const [mode, setMode] = useState(null);
      const [busy, setBusy] = useState(false);
      const [readFailed, setReadFailed] = useState(false);
      const mounted = useRef(false);
      useEffect(() => {
        mounted.current = true;
        let active = true;
        Promise.resolve().then(() => api.speed(sessionId)).then(result => {
          if (!result.ok) throw new Error(result.error?.message);
          if (active) setMode(result.value.mode);
        }).catch(() => { if (active) setReadFailed(true); });
        return () => { active = false; mounted.current = false; };
      }, [api, sessionId]);

      async function select(next) {
        if (busy || locked || mode === null) return;
        setBusy(true);
        try {
          const result = await api.setFast(sessionId, next === 'fast');
          if (!result.ok) throw new Error(result.error?.message);
          if (mounted.current) setMode(result.value.mode);
        } catch (error) {
          reportFailure(error.message || t('writeFailed'));
        } finally {
          if (mounted.current) setBusy(false);
        }
      }

      return h('div', {
        role: 'group', 'aria-labelledby': id,
        style: { padding: '6px 10px', minInlineSize: 0 },
      }, h('span', { id }, t('speed')),
      mode === null
        ? h('span', { role: 'status' }, t(readFailed ? 'readFailed' : 'loading'))
        : h('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap' } }, ...['normal', 'fast'].map(option => {
          const checked = option === 'normal' ? mode === 'standard' : mode !== 'standard';
          return h('button', {
            key: option, type: 'button', role: 'menuitemradio', tabIndex: -1,
            'aria-checked': checked, 'aria-disabled': busy || undefined, disabled: locked,
            style: { font: 'inherit', color: 'inherit', padding: '2px 8px', border: '1px solid var(--dsw-alias-border-default, currentColor)', borderRadius: 6, background: 'transparent', fontWeight: checked ? 600 : 400 },
            onClick: () => { if (!checked) void select(option); },
          }, `${checked ? '✓ ' : ''}${t(option)}`);
        })));
    }

    function ModelOption({ directory, ...props }) {
      const codex = useSyncExternalStore(directory.subscribe, () => isCodex(directory.getSnapshot().current));
      return codex ? h(SpeedControl, { ...props, key: props.sessionId }) : null;
    }

    return {
      inject: ['slots', 'remote', 'locale', 'modelDirectories'],
      async apply(ctx) {
        ctx.effect(() => ctx.locale.register(packageName, dictionaries));
        await ctx.remote.$mount(remoteInfo);
        ctx.inject([`remote.${remoteName}`], scope => {
          scope.slots.inject(slot, () => scope.slots.register({
            name: slot,
            id: packageName,
            order: -10,
            locale: packageName,
            inject: sessionId => ({ directory: scope.modelDirectories.directoryFor(sessionId).store, api: scope.remote[remoteName] }),
          }, ModelOption));
        });
      },
    };
  },
});
