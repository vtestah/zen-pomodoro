#!/usr/bin/env node
'use strict';

// Dependency-free test runner for the pure Flow Soft Landing decision
// (6.4/flow.js). Matches the style of recommend.test.js: the project's
// automated tests are otherwise pytest for the Python helpers; GJS/St UI code
// is verified manually via a Cinnamon reload. This covers the pure logic that
// decides, at the end of a focus pomodoro, whether to break now, hold for a
// natural pause, or quietly extend.
//
// Run:  node tests/js/flow.test.js
// (No external dependencies — uses only the node stdlib `assert`.)

const assert = require('assert');
const path = require('path');

const flow = require(path.join(__dirname, '..', '..', '6.4', 'flow.js'));
const decide = flow.flowLandingDecision;

// A sensible "user is actively working, well within grace" baseline that every
// test tweaks. With these values the only thing keeping it from break-now is
// that the user is active and under the cap.
function base(over) {
    return Object.assign({
        enabled: true,
        behavior: 'wait',
        idleMs: 0,
        pauseThresholdMs: 20000,   // 20s
        graceElapsedMs: 0,
        graceCapMs: 600000         // 10 min
    }, over || {});
}

// --- Tiny harness --------------------------------------------------------
let passed = 0;
let failed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log('  ok   - ' + name);
    } catch (e) {
        failed++;
        console.error('  FAIL - ' + name + '\n         ' + (e && e.message ? e.message : e));
    }
}

// ========================================================================
// Per-branch examples
// ========================================================================

test('feature off -> break-now (even while active and under cap)', () => {
    assert.strictEqual(decide(base({ enabled: false })), 'break-now');
    // extend mode does not override the off switch
    assert.strictEqual(decide(base({ enabled: false, behavior: 'extend' })), 'break-now');
});

test('missing/empty state -> break-now (safe default)', () => {
    assert.strictEqual(decide(), 'break-now');
    assert.strictEqual(decide({}), 'break-now');
    assert.strictEqual(decide(null), 'break-now');
});

test('active + wait mode -> wait', () => {
    assert.strictEqual(decide(base()), 'wait');
});

test('active + extend mode -> extend', () => {
    assert.strictEqual(decide(base({ behavior: 'extend' })), 'extend');
});

test('unknown behavior falls back to wait', () => {
    assert.strictEqual(decide(base({ behavior: 'nonsense' })), 'wait');
    assert.strictEqual(decide(base({ behavior: undefined })), 'wait');
});

test('natural pause reached (idle >= threshold) -> break-now', () => {
    assert.strictEqual(decide(base({ idleMs: 20000 })), 'break-now'); // exactly at threshold
    assert.strictEqual(decide(base({ idleMs: 25000 })), 'break-now'); // past threshold
});

test('just under the pause threshold still holds', () => {
    assert.strictEqual(decide(base({ idleMs: 19999 })), 'wait');
    assert.strictEqual(decide(base({ idleMs: 19999, behavior: 'extend' })), 'extend');
});

test('grace cap reached -> break-now', () => {
    assert.strictEqual(decide(base({ graceElapsedMs: 600000 })), 'break-now'); // exactly at cap
    assert.strictEqual(decide(base({ graceElapsedMs: 700000 })), 'break-now'); // past cap
});

test('just under the cap still holds', () => {
    assert.strictEqual(decide(base({ graceElapsedMs: 599000 })), 'wait');
});

// ========================================================================
// Priority: cap > pause > extend/wait
// ========================================================================

test('cap takes precedence over an active extend session', () => {
    assert.strictEqual(decide(base({ behavior: 'extend', graceElapsedMs: 600000, idleMs: 0 })), 'break-now');
});

test('a natural pause ends an extend session too', () => {
    assert.strictEqual(decide(base({ behavior: 'extend', idleMs: 30000 })), 'break-now');
});

test('cap wins even if the user is mid-keystroke (idle 0)', () => {
    assert.strictEqual(decide(base({ idleMs: 0, graceElapsedMs: 999999 })), 'break-now');
});

// ========================================================================
// Input hardening (NaN / non-numeric / negative)
// ========================================================================

test('NaN cap collapses to 0 -> break-now (graceElapsed >= 0 cap)', () => {
    assert.strictEqual(decide(base({ graceCapMs: NaN })), 'break-now');
    assert.strictEqual(decide(base({ graceCapMs: 'oops' })), 'break-now');
    assert.strictEqual(decide(base({ graceCapMs: undefined })), 'break-now');
});

test('NaN idle is treated as 0 (active) -> holds when under cap', () => {
    assert.strictEqual(decide(base({ idleMs: NaN })), 'wait');
    assert.strictEqual(decide(base({ idleMs: 'oops', behavior: 'extend' })), 'extend');
});

test('negative numbers clamp to 0', () => {
    // negative idle -> 0 (active); negative cap -> 0 -> break-now
    assert.strictEqual(decide(base({ idleMs: -5000 })), 'wait');
    assert.strictEqual(decide(base({ graceCapMs: -1 })), 'break-now');
});

// ========================================================================
// Property-style checks
// ========================================================================

test('property: in both modes, raising idle to the threshold yields break-now', () => {
    for (const behavior of ['wait', 'extend']) {
        const thr = 20000;
        let sawHold = false;
        for (let idle = 0; idle <= thr + 5000; idle += 1000) {
            const out = decide(base({ behavior, idleMs: idle, pauseThresholdMs: thr }));
            if (idle < thr) {
                assert.strictEqual(out, behavior === 'extend' ? 'extend' : 'wait',
                    'under threshold should hold (' + behavior + ', idle=' + idle + ')');
                sawHold = true;
            } else {
                assert.strictEqual(out, 'break-now',
                    'at/over threshold should break (' + behavior + ', idle=' + idle + ')');
            }
        }
        assert.ok(sawHold, 'sanity: saw at least one hold for ' + behavior);
    }
});

test('property: once grace cap is reached, decision is break-now for any other input', () => {
    const combos = [
        { behavior: 'wait', idleMs: 0 },
        { behavior: 'extend', idleMs: 0 },
        { behavior: 'wait', idleMs: 999999 },
        { behavior: 'extend', idleMs: 5 }
    ];
    for (const c of combos) {
        assert.strictEqual(
            decide(base(Object.assign({ graceElapsedMs: 600000, graceCapMs: 600000 }, c))),
            'break-now',
            'cap reached must break: ' + JSON.stringify(c));
    }
});

test('property: feature off is break-now regardless of everything else', () => {
    for (const behavior of ['wait', 'extend', 'weird']) {
        for (const idleMs of [0, 10000, 999999]) {
            for (const graceElapsedMs of [0, 300000, 999999]) {
                assert.strictEqual(
                    decide(base({ enabled: false, behavior, idleMs, graceElapsedMs })),
                    'break-now');
            }
        }
    }
});

// ========================================================================
// Millisecond conversion helpers (used to feed the decision + watches)
// ========================================================================

test('flowPauseThresholdMs: seconds -> ms', () => {
    assert.strictEqual(flow.flowPauseThresholdMs(20), 20000);
    assert.strictEqual(flow.flowPauseThresholdMs(5), 5000);
    assert.strictEqual(flow.flowPauseThresholdMs(120), 120000);
});

test('flowPauseThresholdMs: bad/zero/negative -> 20s default', () => {
    assert.strictEqual(flow.flowPauseThresholdMs(0), 20000);
    assert.strictEqual(flow.flowPauseThresholdMs(-5), 20000);
    assert.strictEqual(flow.flowPauseThresholdMs(NaN), 20000);
    assert.strictEqual(flow.flowPauseThresholdMs(undefined), 20000);
    assert.strictEqual(flow.flowPauseThresholdMs('oops'), 20000);
});

test('flowGraceCapMs: minutes -> ms', () => {
    assert.strictEqual(flow.flowGraceCapMs(10), 600000);
    assert.strictEqual(flow.flowGraceCapMs(1), 60000);
    assert.strictEqual(flow.flowGraceCapMs(30), 1800000);
});

test('flowGraceCapMs: bad/zero/negative -> 10m default', () => {
    assert.strictEqual(flow.flowGraceCapMs(0), 600000);
    assert.strictEqual(flow.flowGraceCapMs(-1), 600000);
    assert.strictEqual(flow.flowGraceCapMs(NaN), 600000);
    assert.strictEqual(flow.flowGraceCapMs(undefined), 600000);
});

test('helpers feed the decision consistently (pause threshold boundary)', () => {
    const thr = flow.flowPauseThresholdMs(20); // 20000
    assert.strictEqual(decide(base({ idleMs: thr, pauseThresholdMs: thr })), 'break-now');
    assert.strictEqual(decide(base({ idleMs: thr - 1, pauseThresholdMs: thr })), 'wait');
});

// ========================================================================
// Simulations of the multi-boundary orchestration (what applet.js drives)
// ========================================================================

test('simulation: extend mode extends each boundary until the cap, then breaks', () => {
    // 5-min focus blocks, 10-min cap: expect extend, extend, then break-now
    // when cumulative grace reaches the cap. User stays active throughout.
    const cap = flow.flowGraceCapMs(10);      // 600000
    const blockMs = 5 * 60 * 1000;            // 300000
    const seen = [];
    for (let grace = 0; grace <= cap; grace += blockMs) {
        seen.push(decide(base({
            behavior: 'extend',
            idleMs: 0,                         // mid-keystroke
            graceElapsedMs: grace,
            graceCapMs: cap
        })));
    }
    assert.deepStrictEqual(seen, ['extend', 'extend', 'break-now']);
});

test('simulation: wait mode holds, then a natural pause ends it', () => {
    const cap = flow.flowGraceCapMs(10);
    const thr = flow.flowPauseThresholdMs(20);
    // Still typing a few seconds in: hold.
    assert.strictEqual(decide(base({ behavior: 'wait', idleMs: 3000, graceElapsedMs: 5000, graceCapMs: cap, pauseThresholdMs: thr })), 'wait');
    // Stopped long enough to count as a pause: break.
    assert.strictEqual(decide(base({ behavior: 'wait', idleMs: thr, graceElapsedMs: 8000, graceCapMs: cap, pauseThresholdMs: thr })), 'break-now');
});

test('simulation: wait mode that never pauses still breaks at the cap', () => {
    const cap = flow.flowGraceCapMs(10);
    const thr = flow.flowPauseThresholdMs(20);
    assert.strictEqual(decide(base({ behavior: 'wait', idleMs: 0, graceElapsedMs: cap, graceCapMs: cap, pauseThresholdMs: thr })), 'break-now');
});

// ------------------------------------------------------------------------
console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
