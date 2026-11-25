// ================================================================
// Codelix OMS — "what counts in profit" choices, shared by every partner.
// Stored on the server (settings key `pl_options`), so the P&L page and
// the dashboard show the same profit to everyone. A copy is kept in the
// browser only to paint the first frame before the server answers.
// ================================================================
import { useCallback, useEffect, useState } from 'react';
import { settingsDB } from './db';
import { DEFAULT_PL_OPTIONS, loadPlOptions, savePlOptions } from './finance';

const KEY = 'pl_options';

/** [options, save(next) → Promise] */
export function usePlOptions() {
  const [opts, setOpts] = useState(loadPlOptions);
  useEffect(() => {
    let live = true;
    settingsDB.get(KEY)
      .then(v => {
        if (!live) return;
        const next = v && typeof v === 'object' ? { ...DEFAULT_PL_OPTIONS, ...v } : DEFAULT_PL_OPTIONS;
        setOpts(next);
        savePlOptions(next);
      })
      .catch(e => console.error('pl_options', e));
    return () => { live = false; };
  }, []);
  const save = useCallback(next => {
    setOpts(next);
    savePlOptions(next);
    return settingsDB.set(KEY, next);
  }, []);
  return [opts, save];
}
