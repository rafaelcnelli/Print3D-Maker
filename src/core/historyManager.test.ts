import assert from 'node:assert/strict';
import test from 'node:test';
import {
  commitHistory,
  createHistoryState,
  inferConfigMergeKey,
  redoHistory,
  undoHistory,
} from './historyManager.ts';
import { createDefaultConfig, DEFAULT_BUILD_PLATE } from './projectDefaults.ts';

function makeSnapshot(overrides: Partial<ReturnType<typeof createDefaultConfig>> = {}) {
  return {
    config: {
      ...createDefaultConfig('svg-keychain'),
      ...overrides,
    },
    buildPlate: DEFAULT_BUILD_PLATE,
  };
}

test('undoHistory and redoHistory step backward and forward cleanly across discrete actions', () => {
  let history = createHistoryState(makeSnapshot({ keyringDirection: 'top' }));

  history = commitHistory(history, makeSnapshot({ keyringDirection: 'top-right' }), {
    timestamp: 1000,
  });
  history = commitHistory(history, makeSnapshot({ keyringDirection: 'right' }), {
    timestamp: 1200,
  });

  assert.equal(history.past.length, 2);
  assert.equal(history.future.length, 0);
  assert.equal(history.present.config.keyringDirection, 'right');

  history = undoHistory(history);
  assert.equal(history.present.config.keyringDirection, 'top-right');
  assert.equal(history.past.length, 1);
  assert.equal(history.future.length, 1);

  history = undoHistory(history);
  assert.equal(history.present.config.keyringDirection, 'top');
  assert.equal(history.past.length, 0);
  assert.equal(history.future.length, 2);

  // Undo at beginning is a no-op
  const atStart = undoHistory(history);
  assert.equal(atStart, history);

  // Redo steps forward again
  history = redoHistory(history);
  assert.equal(history.present.config.keyringDirection, 'top-right');
  history = redoHistory(history);
  assert.equal(history.present.config.keyringDirection, 'right');

  // Redo at end is a no-op
  const atEnd = redoHistory(history);
  assert.equal(atEnd, history);
});

test('new edit after undo clears future redo branch', () => {
  let history = createHistoryState(makeSnapshot({ svgAttachMode: 'arch' }));
  history = commitHistory(history, makeSnapshot({ svgAttachMode: 'hole' }), { timestamp: 100 });
  history = commitHistory(history, makeSnapshot({ svgAttachMode: 'loop' }), { timestamp: 200 });

  history = undoHistory(history);
  assert.equal(history.present.config.svgAttachMode, 'hole');
  assert.equal(history.future.length, 1);

  history = commitHistory(history, makeSnapshot({ primaryColor: '#D93848' }), { timestamp: 300 });
  assert.equal(history.future.length, 0);
  assert.equal(history.present.config.primaryColor, '#D93848');
});

test('coalesces rapid continuous edits with same mergeKey within mergeWindowMs into single undo step', () => {
  let history = createHistoryState(makeSnapshot({ text: 'MARIA' }));

  history = commitHistory(history, makeSnapshot({ text: 'A' }), {
    mergeKey: inferConfigMergeKey({ text: 'A' }),
    timestamp: 1000,
  });
  history = commitHistory(history, makeSnapshot({ text: 'AN' }), {
    mergeKey: inferConfigMergeKey({ text: 'AN' }),
    timestamp: 1200,
  });
  history = commitHistory(history, makeSnapshot({ text: 'ANA' }), {
    mergeKey: inferConfigMergeKey({ text: 'ANA' }),
    timestamp: 1400,
  });

  // Burst should produce only 1 undo step back to 'MARIA'
  assert.equal(history.past.length, 1);
  assert.equal(history.present.config.text, 'ANA');

  // Pause longer than merge window -> creates a second distinct step
  history = commitHistory(history, makeSnapshot({ text: 'ANA PAULA' }), {
    mergeKey: inferConfigMergeKey({ text: 'ANA PAULA' }),
    timestamp: 3000,
  });
  assert.equal(history.past.length, 2);

  history = undoHistory(history);
  assert.equal(history.present.config.text, 'ANA');

  history = undoHistory(history);
  assert.equal(history.present.config.text, 'MARIA');
});

test('ignores identical snapshot commits and respects maxHistory cap', () => {
  let history = createHistoryState(makeSnapshot({ widthMm: 50 }));
  const unchanged = commitHistory(history, makeSnapshot({ widthMm: 50 }), { timestamp: 100 });
  assert.equal(unchanged, history);

  for (let i = 1; i <= 5; i += 1) {
    history = commitHistory(
      history,
      makeSnapshot({ widthMm: 50 + i }),
      { mergeKey: null, timestamp: i * 1000, maxHistory: 3 }
    );
  }
  assert.equal(history.past.length, 3);
  assert.equal(history.present.config.widthMm, 55);
  assert.equal(history.past[0].config.widthMm, 52);
});
