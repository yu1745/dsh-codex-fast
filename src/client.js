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
    const { Fragment: ReactFragment, createElement: h, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } = require('react');

    function SpeedControl({ sessionId, api, locked, reportFailure, t }) {
      const id = useId();
      const trigger = useRef(null);
      const [expanded, setExpanded] = useState(false);
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
          const result = await api.setFast(sessionId, next === 'fast');
          if (!result.ok) throw new Error(result.error?.message);
          if (mounted.current) setMode(result.value.mode);
        } catch (error) {
          reportFailure(error.message || t('writeFailed'));
        } finally {
          if (mounted.current) setBusy(false);
        }
      }

      const [rowClass, labelClass, valueClass, iconClass] = classes;
      const current = mode === 'standard' ? 'normal' : 'fast';
      function closeOptions() {
        setExpanded(false);
        trigger.current?.focus();
      }
      return h(ReactFragment, null,
        h('button', {
          ref: trigger, id, type: 'button', role: 'menuitem', className: rowClass,
          'aria-expanded': expanded, 'aria-controls': expanded ? `${id}-options` : undefined,
          onClick: () => setExpanded(value => !value),
        }, h('span', { className: labelClass }, t('speed')),
        h('span', { className: valueClass }, mode === null ? t(readFailed ? 'readFailed' : 'loading') : t(current)),
        h('svg', { className: iconClass, width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': true,
          style: expanded ? { transform: 'rotate(90deg)' } : undefined },
        h('path', { d: 'm4.5 2.5 3.5 3.5-3.5 3.5', fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' }))),
        expanded && mode !== null && h('div', {
          id: `${id}-options`, role: 'group', 'aria-labelledby': id,
          onKeyDown: event => {
            if (event.key !== 'Escape' && event.key !== 'ArrowLeft') return;
            event.preventDefault();
            event.stopPropagation();
            closeOptions();
          },
        }, ...['normal', 'fast'].map(option => h('button', {
          key: option, type: 'button', role: 'menuitemradio', className: rowClass,
          'aria-checked': current === option, disabled: locked || busy,
          onClick: () => { if (current !== option) void select(option); closeOptions(); },
        }, h('span', { className: labelClass, style: { paddingInlineStart: 12 } }, t(option)),
        h('span', { className: valueClass, 'aria-hidden': true }, current === option ? '✓' : '')))));
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
