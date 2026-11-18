import { remoteInfo } from './remote.js';
import { isCodex, packageName, remoteName } from './shared.js';

const slot = 'conversation.input.model.options';
const dictionaries = {
  en: { speed: 'Codex fast mode', loading: 'Loading Codex speed…', readFailed: 'Could not read Codex speed.', writeFailed: 'Could not change Codex speed.' },
  zh: { speed: 'Codex 快速模式', loading: '正在读取 Codex 速度…', readFailed: '无法读取 Codex 速度。', writeFailed: '无法更改 Codex 速度。' },
};

window.__ModuleLoader__.load({
  id: packageName,
  factory(require) {
    const { createElement: h, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } = require('react');

    function SpeedControl({ sessionId, api, locked, reportFailure, t }) {
      const trigger = useRef(null);
      const [classes, setClasses] = useState([]);
      useLayoutEffect(() => {
        const row = trigger.current?.closest('[role="menu"]')?.querySelector('button[role="menuitem"]');
        if (row && row !== trigger.current) {
          setClasses([row.className, ...Array.from(row.children, child => child.getAttribute('class'))]);
        }
      }, []);
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
          const result = await api.setFast(sessionId, next);
          if (!result.ok) throw new Error(result.error?.message);
          if (mounted.current) setMode(result.value.mode);
        } catch (error) {
          reportFailure(error.message || t('writeFailed'));
        } finally {
          if (mounted.current) setBusy(false);
        }
      }

      const [rowClass, labelClass, valueClass] = classes;
      const checked = mode === 'fast' || mode === 'ultrafast';
      const blocked = locked || busy || mode === null;
      return h('button', {
        ref: trigger, type: 'button', role: 'switch', className: rowClass,
        'aria-checked': checked, 'aria-disabled': blocked || undefined,
        title: mode === null ? t(readFailed ? 'readFailed' : 'loading') : undefined,
        onClick: () => { if (!blocked) void select(!checked); },
      }, h('span', { className: labelClass }, t('speed')),
      h('span', { className: valueClass, 'aria-hidden': true }),
      h('span', {
        'aria-hidden': true,
        style: {
          display: 'inline-flex', alignItems: 'center', flex: 'none',
          width: 36, height: 20, padding: 2, boxSizing: 'border-box', borderRadius: 999,
          background: checked ? 'var(--dsw-alias-label-primary, #202127)' : 'color-mix(in srgb, currentColor 15%, transparent)',
          justifyContent: checked ? 'flex-end' : 'flex-start',
          opacity: blocked ? 0.55 : 1,
        },
      }, h('span', { style: { width: 16, height: 16, borderRadius: '50%', background: 'var(--dsw-alias-background-primary, white)' } })));
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
