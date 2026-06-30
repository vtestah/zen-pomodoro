#!/usr/bin/env node
'use strict';

// Dependency-free tests for the pure date math in 6.4/datemath.js. dateDaysAgo
// steps by calendar date (not 24h subtraction), so day stepping never skips or
// duplicates a day across a DST transition — the regression these lock in. The
// cases below span the real 2025-03-30 spring-forward; calendar arithmetic is
// timezone-independent here, so the assertions are deterministic everywhere.
//
// Run:  node tests/js/datemath.test.js   (no external dependencies)

const assert = require('assert');
const path = require('path');

const dm = require(path.join(__dirname, '..', '..', '6.4', 'datemath.js'));

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; }
    catch (e) { failed++; console.log('FAIL - ' + name + '\n  ' + (e && e.message)); }
}

test('dayKey formats local Y-M-D, zero-padded', () => {
    assert.strictEqual(dm.dayKey(new Date(2025, 0, 5)), '2025-01-05');
    assert.strictEqual(dm.dayKey(new Date(2025, 11, 31)), '2025-12-31');
});

test('daysBetween counts whole days (signed)', () => {
    assert.strictEqual(dm.daysBetween('2025-01-01', '2025-01-02'), 1);
    assert.strictEqual(dm.daysBetween('2025-01-01', '2025-01-01'), 0);
    assert.strictEqual(dm.daysBetween('2025-01-10', '2025-01-01'), -9);
});

test('daysBetween across the spring-forward day is still 1', () => {
    assert.strictEqual(dm.daysBetween('2025-03-29', '2025-03-30'), 1);
    assert.strictEqual(dm.daysBetween('2025-03-30', '2025-03-31'), 1);
});

test('dateDaysAgo returns midnight N calendar days back', () => {
    const now = new Date(2025, 5, 15, 13, 30);
    assert.strictEqual(dm.dayKey(dm.dateDaysAgo(now, 0)), '2025-06-15');
    assert.strictEqual(dm.dayKey(dm.dateDaysAgo(now, 1)), '2025-06-14');
    assert.strictEqual(dm.dayKey(dm.dateDaysAgo(now, 20)), '2025-05-26'); // crosses a month
});

test('dateDaysAgo never skips/duplicates a day across spring-forward', () => {
    const now = new Date(2025, 3, 2, 0, 30); // Apr 2 2025, early morning
    const keys = [];
    for (let i = 0; i < 7; i++) { keys.push(dm.dayKey(dm.dateDaysAgo(now, i))); }
    assert.deepStrictEqual(keys, [
        '2025-04-02', '2025-04-01', '2025-03-31', '2025-03-30',
        '2025-03-29', '2025-03-28', '2025-03-27'
    ]);
    for (let i = 1; i < keys.length; i++) {
        assert.strictEqual(dm.daysBetween(keys[i], keys[i - 1]), 1);
    }
});

test('dateDaysAgo crosses the year boundary', () => {
    assert.strictEqual(dm.dayKey(dm.dateDaysAgo(new Date(2025, 0, 1, 9, 0), 1)), '2024-12-31');
});

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
