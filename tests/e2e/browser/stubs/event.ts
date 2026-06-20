type Handler<T> = (event: { event: string; payload: T }) => void;

const listeners = new Map<string, Set<Handler<unknown>>>();

export async function listen<T>(event: string, handler: Handler<T>): Promise<() => void> {
  const set = listeners.get(event) ?? new Set<Handler<unknown>>();
  set.add(handler as Handler<unknown>);
  listeners.set(event, set);
  return () => {
    set.delete(handler as Handler<unknown>);
  };
}

export async function emit<T>(event: string, payload?: T): Promise<void> {
  for (const handler of listeners.get(event) ?? []) {
    handler({ event, payload });
  }
}

export async function emitTo<T>(_target: string, event: string, payload?: T): Promise<void> {
  await emit(event, payload);
}
