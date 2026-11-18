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
    const { createElement: h, useEffect, useRef, useState, useSyncExternalStore } = require('react');

    const { Switch } = require('@deepseek-ai/dsh-client-ui-primitives');

    function SpeedControl({ sessionId, api, locked, reportFailure, t }) {
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

      const checked = mode === 'fast' || mode === 'ultrafast';
      return h('div', { className: 'yu-codex-speed-row', title: mode === null ? t(readFailed ? 'readFailed' : 'loading') : undefined },
        h('span', null, t('speed')),
        h(Switch, {
          className: 'yu-codex-speed-switch', label: t('speed'), checked,
          disabled: locked || busy || mode === null, onChange: select,
        }));
    }

    function ModelOption({ directory, ...props }) {
      const codex = useSyncExternalStore(directory.subscribe, () => isCodex(directory.getSnapshot().current));
      return codex ? h(SpeedControl, { ...props, key: props.sessionId }) : null;
    }

    return {
      inject: ['slots', 'remote', 'locale', 'modelDirectories'],
      async apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style');
          style.textContent = `
            .yu-codex-speed-row { border-radius: var(--dsw-radius-md); min-height: 34px; color: var(--dsw-alias-label-primary); justify-content: space-between; align-items: center; gap: 16px; padding: 0 8px; font-size: 13px; line-height: 20px; display: flex; position: relative; }
            .yu-codex-speed-row .yu-codex-speed-switch { position: static; }
            .yu-codex-speed-switch::after { content: ''; border-radius: var(--dsw-radius-md); position: absolute; inset: 0; }
            .yu-codex-speed-row:has(.yu-codex-speed-switch:focus-visible) { background: var(--dsw-alias-interactive-bg-hover); }
            @media (hover: hover) { .yu-codex-speed-row:has(.yu-codex-speed-switch:not(:disabled)):hover { background: var(--dsw-alias-interactive-bg-hover); } }
          `;
          document.head.append(style);
          return () => style.remove();
        });
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
