import { createSpeedState } from './speed-state.js';
import { remoteInfo } from './remote.js';
import { isCodex, packageName, remoteName } from './shared.js';

const menuSlot = 'conversation.input.model.options';
const dockSlot = 'conversation.composer.dock';
const dictionaries = {
  en: { speed: 'Codex fast mode', loading: 'Loading Codex speed…', readFailed: 'Could not read Codex speed.', writeFailed: 'Could not change Codex speed.' },
  zh: { speed: 'Codex 快速模式', loading: '正在读取 Codex 速度…', readFailed: '无法读取 Codex 速度。', writeFailed: '无法更改 Codex 速度。' },
};

window.__ModuleLoader__.load({
  id: packageName,
  factory(require) {
    const { createElement: h, useEffect, useSyncExternalStore } = require('react');

    const { Switch } = require('@deepseek-ai/dsh-client-ui-primitives');

    function SpeedControl({ state, locked, reportFailure, t, dock }) {
      const { mode, busy, error } = useSyncExternalStore(state.subscribe, state.snapshot);
      useEffect(() => { void state.refresh(); }, [state]);
      const checked = mode === 'fast' || mode === 'ultrafast';
      const disabled = locked || busy || mode === null;
      const label = t('speed');
      const status = error ? t(mode === null ? 'readFailed' : 'writeFailed') : mode === null ? t('loading') : undefined;
      function select(next) {
        if (disabled) return;
        void state.select(next).catch(() => reportFailure?.(t('writeFailed')));
      }
      if (dock) return h('button', {
        type: 'button', className: 'yu-codex-speed-lightning',
        'aria-label': label, 'aria-pressed': checked, title: status ?? label,
        disabled, onClick: () => select(!checked),
      }, h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', 'aria-hidden': true },
        h('path', { d: 'M13 2 4 14h7l-1 8 10-12h-7l1-8Z', fill: checked ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinejoin: 'round' })));
      return h('div', { className: 'yu-codex-speed-row', title: status },
        h('span', null, label),
        h(Switch, { className: 'yu-codex-speed-switch', label, checked, disabled, onChange: select }));
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
            .yu-codex-speed-lightning { display: inline-grid; place-items: center; min-width: 28px; min-height: 28px; padding: 4px; border: 0; border-radius: var(--dsw-radius-md); background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
            .yu-codex-speed-lightning[aria-pressed=true] { color: var(--dsw-alias-state-warn-primary); }
            .yu-codex-speed-lightning:disabled { opacity: .55; cursor: default; }
            .yu-codex-speed-lightning:focus-visible, .yu-codex-speed-lightning:not(:disabled):hover { background: var(--dsw-alias-interactive-bg-hover); }
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
          const states = new Map();
          for (const [name, order, dock] of [[menuSlot, -10, false], [dockSlot, 1000, true]]) {
            scope.slots.inject(name, () => scope.slots.register({
              name, order, id: packageName, locale: packageName,
              inject(sessionId) {
                if (!states.has(sessionId)) states.set(sessionId, createSpeedState(scope.remote[remoteName], sessionId));
                return { directory: scope.modelDirectories.directoryFor(sessionId).store, state: states.get(sessionId), dock };
              },
            }, ModelOption));
          }
        });
      },
    };
  },
});
