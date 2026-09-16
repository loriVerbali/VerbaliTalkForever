/**
 * Provides one IEP measurement store to the app, loads it once, and re-renders
 * subscribers when it changes. The capture facade is attached so keyboard hooks can
 * record events without holding a reference to the store.
 */

import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { attachIepCaptureStore } from '../capture/iepCapture';
import { FsPersistence } from '../store/fsPersistence';
import { IepMeasurementStore } from '../store/measurementStore';
import { IepPersistence } from '../store/persistence';

interface IepStoreContextValue {
  store: IepMeasurementStore;
  ready: boolean;
}

const IepStoreContext = createContext<IepStoreContextValue | null>(null);

export const IepStoreProvider: React.FC<{ children: React.ReactNode; persistence?: IepPersistence }> = ({
  children,
  persistence,
}) => {
  const store = useMemo(() => new IepMeasurementStore(persistence ?? new FsPersistence()), [persistence]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    attachIepCaptureStore(store);
    store
      .load()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
      attachIepCaptureStore(null);
    };
  }, [store]);

  const value = useMemo(() => ({ store, ready }), [store, ready]);
  return <IepStoreContext.Provider value={value}>{children}</IepStoreContext.Provider>;
};

export function useIepStore(): IepStoreContextValue {
  const value = useContext(IepStoreContext);
  if (!value) {
    throw new Error('useIepStore must be used inside IepStoreProvider');
  }
  return value;
}

/** Re-renders when the store changes. Returns a monotonically increasing version. */
export function useIepStoreVersion(): number {
  const { store } = useIepStore();
  const versionRef = React.useRef(0);
  return useSyncExternalStore(
    onChange =>
      store.subscribe(() => {
        versionRef.current += 1;
        onChange();
      }),
    () => versionRef.current,
    () => versionRef.current,
  );
}
