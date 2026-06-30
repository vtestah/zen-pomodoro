#!/usr/bin/env node
'use strict';

// Unit tests for the pure queue/position logic in 6.4/timer.js. The module uses
// GJS imports (Mainloop for ticking, Signals for connect/emit), so we stub a
// minimal `global.imports` before requiring it — the timers never actually tick
// here, we only exercise the queue advancement and the tick-count accessors.
//
// Run:  node tests/js/timer.test.js   (no external dependencies)

global.imports = {
    mainloop: {
        timeout_add_seconds: () => 1,
        timeout_add: () => 1,
        source_remove: () => {}
    },
    signals: {
        addSignalMethods(proto) {
            proto.connect = function (name, cb) {
                this.__h = this.__h || {};
                (this.__h[name] = this.__h[name] || []).push(cb);
                this.__id = (this.__id || 0) + 1;
                return this.__id;
            };
            proto.disconnect = function () {};
            proto.emit = function (name) {
                let args = Array.prototype.slice.call(arguments, 1);
                ((this.__h && this.__h[name]) || []).forEach((cb) => cb.apply(null, [this].concat(args)));
            };
        }
    }
};

const assert = require('assert');
const path = require('path');
const { Timer, TimerQueue } = require(path.join(__dirname, '..', '..', '6.4', 'timer.js'));

let passed = 0;
let failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log('  ok   - ' + name); }
    catch (e) { failed++; console.log('  FAIL - ' + name + '\n         ' + e.message); }
}

// A lightweight stand-in for a Timer, so the queue tests stay independent of the
// real ticking machinery. start()/stop() flip a running flag the queue reads.
function mockTimer() {
    let running = false;
    return {
        connect: () => 1, disconnect: () => {},
        start: function () { running = true; },
        stop: function () { running = false; },
        reset: function () {},
        isRunning: () => running
    };
}

// --- Timer: tick-count accessors -----------------------------------------
test('Timer.getTimerLimit reflects the configured limit', () => {
    assert.strictEqual(new Timer({ name: "test", timerLimit: 300 }).getTimerLimit(), 300);
});

test('Timer.setRemaining sets the remaining ticks, limit unchanged', () => {
    let t = new Timer({ name: "test", timerLimit: 300 });
    t.setRemaining(120);
    assert.strictEqual(t.getTicksRemaining(), 120);
    assert.strictEqual(t.getTimerLimit(), 300);
});

test('Timer.setRemaining ignores invalid values', () => {
    let t = new Timer({ name: "test", timerLimit: 300 });
    t.setRemaining(120);
    t.setRemaining(-5);
    t.setRemaining(NaN);
    assert.strictEqual(t.getTicksRemaining(), 120);
});

// --- TimerQueue: position + advancement ----------------------------------
test('TimerQueue.addTimer / getCurrentTimer / getPosition', () => {
    let q = new TimerQueue();
    let a = mockTimer(), b = mockTimer();
    q.addTimer(a); q.addTimer(b);
    assert.strictEqual(q.getPosition(), 0);
    assert.strictEqual(q.getCurrentTimer(), a);
});

test('TimerQueue.setPosition moves within bounds and rejects out-of-range', () => {
    let q = new TimerQueue();
    q.addTimer(mockTimer()); q.addTimer(mockTimer()); q.addTimer(mockTimer());
    assert.strictEqual(q.setPosition(2), true);
    assert.strictEqual(q.getPosition(), 2);
    assert.strictEqual(q.setPosition(99), false);
    assert.strictEqual(q.setPosition(-1), false);
    assert.strictEqual(q.getPosition(), 2);
});

test('TimerQueue._queueIsFinished is true only on the last timer', () => {
    let q = new TimerQueue();
    q.addTimer(mockTimer()); q.addTimer(mockTimer()); q.addTimer(mockTimer());
    q.setPosition(1);
    assert.strictEqual(q._queueIsFinished(), false);
    q.setPosition(2);
    assert.strictEqual(q._queueIsFinished(), true);
});

test('TimerQueue.skip advances to the next timer', () => {
    let q = new TimerQueue();
    let a = mockTimer(), b = mockTimer();
    q.addTimer(a); q.addTimer(b);
    q.start();                       // starts a (running)
    assert.strictEqual(q.getPosition(), 0);
    q.skip();                        // a running + handler -> advance
    assert.strictEqual(q.getPosition(), 1);
    assert.strictEqual(q.getCurrentTimer(), b);
});

test('TimerQueue.skip on the last timer finishes the queue without advancing past the end', () => {
    let q = new TimerQueue();
    let a = mockTimer(), b = mockTimer();
    q.addTimer(a); q.addTimer(b);
    q.start();
    q.skip();                        // -> position 1 (b, the last)
    let finished = false;
    q.connect('timer-queue-finished', () => { finished = true; });
    q.skip();                        // b is last -> queue finished, no further advance
    assert.strictEqual(finished, true);
    assert.strictEqual(q.getPosition(), 1);
});

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
