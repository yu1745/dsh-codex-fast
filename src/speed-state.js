export function createSpeedState(api, sessionId) {
  let snapshot = { mode: null, busy: false, error: false };
  let reading;
  const listeners = new Set();
  const update = changes => {
    snapshot = { ...snapshot, ...changes };
    for (const listener of listeners) listener();
  };

  return {
    snapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh() {
      if (snapshot.busy) return;
      if (!reading) {
        reading = Promise.resolve().then(() => api.speed(sessionId)).then(result => {
          if (!result.ok) throw new Error(result.error?.message);
          update({ mode: result.value.mode, error: false });
        }).catch(() => update({ error: true })).finally(() => { reading = undefined; });
      }
      return reading;
    },
    async select(enabled) {
      if (snapshot.busy || snapshot.mode === null) return;
      update({ busy: true, error: false });
      try {
        await reading;
        const result = await api.setFast(sessionId, enabled);
        if (!result.ok) throw new Error(result.error?.message);
        update({ mode: result.value.mode, error: false });
      } catch (error) {
        update({ error: true });
        throw error;
      } finally {
        update({ busy: false });
      }
    },
  };
}
