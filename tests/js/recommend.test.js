#!/usr/bin/env node
'use strict';

// Dependency-free test runner for the pure onboarding recommendation engine
// (6.4/recommend.js). The project's automated tests are otherwise pytest for
// the Python helpers; GJS/St UI code is verified manually via a Cinnamon
// reload. This covers the engine's pure logic, which carries the real
// decision-making the wizard depends on.
//
// Run:  node tests/js/recommend.test.js
// (No external dependencies — uses only the node stdlib `assert`.)

const assert = require('assert');
const path = require('path');

const reco = require(path.join(__dirname, '..', '..', '6.4', 'recommend.js'));

// --- Test deps: identity gettext + a minimal %d/%s formatter -------------
const _ = (s) => s;
function fmt(t) {
    const args = Array.prototype.slice.call(arguments, 1);
    let i = 0;
    return String(t).replace(/%[ds]/g, () => String(args[i++]));
}
const deps = { _, format: fmt };

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

function plan(answers) { return reco.computeFocusPlan(answers, deps); }
function keys(answers) { return reco.selectKeys(plan(answers).items); }
function itemById(answers, id) { return plan(answers).items.find((it) => it.id === id); }
function reasons(answers) { return plan(answers).items.filter((it) => it.label).map((it) => it.label); }

// ========================================================================
// Task 1 — parity with the classic single-select wizard
// ========================================================================

test('defaults: classic 25 / 5 / 15 rhythm, 4 pomodori', () => {
    const k = keys({});
    assert.strictEqual(k.pomodoro_duration, 25);
    assert.strictEqual(k.short_break_duration, 5);
    assert.strictEqual(k.long_break_duration, 15);
    assert.strictEqual(k.pomodori_number, 4);
});

test('rhythm item is core and always present', () => {
    const r = itemById({}, 'rhythm');
    assert.ok(r, 'rhythm item exists');
    assert.strictEqual(r.core, true);
});

test('attention=long widens rhythm to 50 / 10 / 20', () => {
    const k = keys({ attention: 'long' });
    assert.strictEqual(k.pomodoro_duration, 50);
    assert.strictEqual(k.short_break_duration, 10);
    assert.strictEqual(k.long_break_duration, 20);
});

test('work=deep with medium attention ramps focus to 30 min and enables flow', () => {
    const k = keys({ work: 'deep', attention: 'medium' });
    assert.strictEqual(k.pomodoro_duration, 30);
    assert.strictEqual(k.flow_extend, true);
    assert.strictEqual(k.flow_extend_minutes, 10);
});

test('work=admin shortens focus by 5 min', () => {
    const k = keys({ work: 'admin', attention: 'medium' });
    assert.strictEqual(k.pomodoro_duration, 20);
});

test('work=creative lengthens the long break', () => {
    const k = keys({ work: 'creative', attention: 'medium' });
    assert.strictEqual(k.long_break_duration, 20); // 15 + 5
});

test('load maps to daily_goal (try=0, light=4, full=6, push=8)', () => {
    assert.strictEqual(keys({ load: 'try' }).daily_goal, 0);
    assert.strictEqual(keys({ load: 'light' }).daily_goal, 4);
    assert.strictEqual(keys({ load: 'full' }).daily_goal, 6);
    assert.strictEqual(keys({ load: 'push' }).daily_goal, 8);
});

test('soundscape=silence mutes ticking, chime and ambience', () => {
    const k = keys({ sound: 'silence' });
    assert.strictEqual(k.timer_sound, false);
    assert.strictEqual(k.interval_chime, false);
    assert.strictEqual(k.focus_ambient_choice, 'off');
});

test('soundscape=ambient picks brown noise at 40%', () => {
    const k = keys({ sound: 'ambient' });
    assert.strictEqual(k.focus_ambient_choice, 'brown');
    assert.strictEqual(k.focus_ambient_volume, 40);
});

test('soundscape=chime uses 180s for short attention, 300s otherwise', () => {
    assert.strictEqual(keys({ sound: 'chime', attention: 'short' }).interval_chime_seconds, 180);
    assert.strictEqual(keys({ sound: 'chime', attention: 'medium' }).interval_chime_seconds, 300);
    assert.strictEqual(keys({ sound: 'chime' }).interval_chime, true);
});

test('soundscape=shared enables visual-only cues + DND', () => {
    const k = keys({ sound: 'shared' });
    assert.strictEqual(k.focus_dnd, true);
    assert.strictEqual(k.focus_show_task_chip, true);
    assert.strictEqual(k.start_sound, false);
    assert.strictEqual(k.break_sound, false);
});

test('assist: notifications -> focus_dnd', () => {
    assert.strictEqual(keys({ struggle: 'notifications' }).focus_dnd, true);
});

test('assist: websites -> enable_blocking', () => {
    assert.strictEqual(keys({ struggle: 'websites' }).enable_blocking, true);
});

test('assist: starting -> one-click start + ritual', () => {
    const k = keys({ struggle: 'starting' });
    assert.strictEqual(k.start_on_click, true);
    assert.strictEqual(k.focus_start_ritual, true);
    assert.strictEqual(k.require_focus_task, false);
});

test('assist: anxiety -> calm theme, no warn sound, no seconds', () => {
    const k = keys({ struggle: 'anxiety' });
    assert.strictEqual(k.theme_preset, 'cool');
    assert.strictEqual(k.warn_sound, false);
    assert.strictEqual(k.show_seconds, false);
    assert.strictEqual(k.breathing_pattern, 'relax');
});

test('no struggle -> no assist item is produced', () => {
    const ids = plan({}).items.map((it) => it.id);
    assert.ok(!ids.some((id) => id.indexOf('assist:') === 0), 'no assist item');
});

test('conflict: flow attention + overwork -> later assist clears flow_extend', () => {
    // attention=flow turns flow_extend on; the overwork assist must override it.
    const k = keys({ attention: 'flow', struggle: 'overwork' });
    assert.strictEqual(k.flow_extend, false);
    assert.strictEqual(k.auto_start_after_pomodoro_ends, true);
    assert.strictEqual(k.flow_extend_minutes, 10); // still set by the flow item
});

test('rhythm reason carries the chosen numbers', () => {
    const rs = reasons({ work: 'deep', attention: 'medium', sound: 'silence', struggle: 'notifications' });
    assert.ok(rs.some((r) => r.indexOf('30 / 5 / 15') !== -1), 'rhythm numbers in a reason');
    assert.ok(!rs.some((r) => !r), 'no empty reasons');
});

test('flow item is non-core and carries a label (toggleable on review)', () => {
    const it = itemById({ work: 'deep' }, 'flow');
    assert.ok(it, 'flow item exists for deep work');
    assert.strictEqual(it.core, false);
    assert.ok(it.label && it.label.length > 0, 'flow has a visible label');
});

test('reasons order: rhythm, goal, sound, assist', () => {
    const rs = reasons({ struggle: 'notifications', sound: 'silence' });
    assert.strictEqual(rs.length, 4);
    assert.ok(rs[0].indexOf('Focus rhythm') === 0, 'rhythm first');
    assert.ok(rs[1].indexOf('Daily goal') === 0, 'goal second');
});

// ========================================================================
// selectKeys — the apply contract (used by review checkboxes, Task 2)
// ========================================================================

test('selectKeys: a disabled non-core item contributes no keys', () => {
    const p = plan({ struggle: 'websites' });
    const assist = p.items.find((it) => it.id === 'assist:websites');
    assist.enabled = false;
    const k = reco.selectKeys(p.items);
    assert.strictEqual(k.enable_blocking, undefined, 'blocking not applied when unchecked');
    assert.strictEqual(k.pomodoro_duration, 25, 'core rhythm still applied');
});

test('selectKeys: core items apply even if marked disabled', () => {
    const p = plan({});
    p.items.forEach((it) => { it.enabled = false; });
    const k = reco.selectKeys(p.items);
    assert.strictEqual(k.pomodoro_duration, 25, 'core ignores enabled=false');
    assert.strictEqual(k.daily_goal, undefined, 'non-core goal dropped when disabled');
});

// ========================================================================
// collectBackupKeys — the undo snapshot key set (Task 3)
// ========================================================================

test('collectBackupKeys: union of all item keys, de-duplicated', () => {
    const p = plan({ struggle: 'websites', sound: 'silence', load: 'full' });
    const bk = reco.collectBackupKeys(p.items);
    assert.ok(bk.indexOf('pomodoro_duration') !== -1, 'core rhythm key present');
    assert.ok(bk.indexOf('daily_goal') !== -1, 'goal key present');
    assert.ok(bk.indexOf('enable_blocking') !== -1, 'assist key present');
    assert.strictEqual(bk.length, new Set(bk).size, 'no duplicate keys');
});

test('collectBackupKeys: includes keys of disabled items (faithful undo)', () => {
    const p = plan({ struggle: 'websites' });
    p.items.forEach((it) => { it.enabled = false; });
    const bk = reco.collectBackupKeys(p.items);
    assert.ok(bk.indexOf('enable_blocking') !== -1, 'disabled item key still snapshotted');
    assert.ok(bk.indexOf('pomodoro_duration') !== -1, 'core key still snapshotted');
});

// ========================================================================
// Multi-select obstacles (Task 4)
// ========================================================================

test('multi: notifications + websites enables both assists', () => {
    const k = keys({ struggle: ['notifications', 'websites'] });
    assert.strictEqual(k.focus_dnd, true);
    assert.strictEqual(k.enable_blocking, true);
});

test('multi: anxiety + overwork combine without losing either', () => {
    const k = keys({ struggle: ['anxiety', 'overwork'] });
    assert.strictEqual(k.theme_preset, 'cool');                  // anxiety
    assert.strictEqual(k.warn_sound, false);                     // anxiety
    assert.strictEqual(k.auto_start_after_pomodoro_ends, true);  // overwork
    assert.strictEqual(k.break_breathing, true);                 // overwork
});

test('multi: selection is capped at RECO_STRUGGLE_LIMIT (3), priority-ordered', () => {
    const p = plan({ struggle: ['anxiety', 'overwork', 'starting', 'websites', 'notifications'] });
    const assistIds = p.items.filter((it) => it.id.indexOf('assist:') === 0).map((it) => it.id);
    assert.strictEqual(reco.RECO_STRUGGLE_LIMIT, 3);
    assert.strictEqual(assistIds.length, 3, 'capped to 3 assists');
    assert.deepStrictEqual(assistIds, ['assist:notifications', 'assist:websites', 'assist:starting']);
});

test('multi: result is independent of selection order', () => {
    const a = plan({ struggle: ['websites', 'notifications', 'overwork'] }).items.map((it) => it.id);
    const b = plan({ struggle: ['overwork', 'websites', 'notifications'] }).items.map((it) => it.id);
    assert.deepStrictEqual(a, b);
});

test('multi: duplicate picks are ignored', () => {
    const ids = plan({ struggle: ['websites', 'websites', 'notifications'] })
        .items.filter((it) => it.id.indexOf('assist:') === 0).map((it) => it.id);
    assert.deepStrictEqual(ids, ['assist:notifications', 'assist:websites']);
});

test('multi: flow attention + overwork still clears flow_extend (conflict by order)', () => {
    const k = keys({ attention: 'flow', struggle: ['overwork', 'notifications'] });
    assert.strictEqual(k.flow_extend, false);
    assert.strictEqual(k.focus_dnd, true);
});

test('multi: empty array and "none" produce no assists', () => {
    assert.ok(!plan({ struggle: [] }).items.some((it) => it.id.indexOf('assist:') === 0));
    assert.ok(!plan({ struggle: 'none' }).items.some((it) => it.id.indexOf('assist:') === 0));
});

test('back-compat: a single string obstacle still works', () => {
    assert.strictEqual(keys({ struggle: 'anxiety' }).theme_preset, 'cool');
});

// ========================================================================
// Adaptive question flow (Task 5)
// ========================================================================

function flowKeys(answers) { return reco.buildQuestionFlow(answers, deps).map((n) => n.key); }

test('flow: base flow has no branch questions', () => {
    assert.deepStrictEqual(flowKeys({}), ['work', 'attention', 'struggle', 'sound', 'load']);
});

test('flow: choosing websites inserts the sites branch right after struggle', () => {
    const f = flowKeys({ struggle: ['websites'] });
    assert.deepStrictEqual(f, ['work', 'attention', 'struggle', 'sites', 'sound', 'load']);
});

test('flow: sound=chime inserts the chime-interval branch after sound', () => {
    const f = flowKeys({ sound: 'chime' });
    assert.deepStrictEqual(f, ['work', 'attention', 'struggle', 'sound', 'chimeInterval', 'load']);
});

test('flow: flow attention (no overwork) appends the auto-break branch', () => {
    const f = flowKeys({ attention: 'flow' });
    assert.strictEqual(f[f.length - 1], 'autobreak');
});

test('flow: overwork suppresses the auto-break branch (already implied)', () => {
    assert.ok(flowKeys({ attention: 'flow', struggle: ['overwork'] }).indexOf('autobreak') === -1);
});

test('flow: all branches can appear together in the right order', () => {
    const f = flowKeys({ attention: 'flow', struggle: ['websites'], sound: 'chime' });
    assert.deepStrictEqual(f, ['work', 'attention', 'struggle', 'sites', 'sound', 'chimeInterval', 'load', 'autobreak']);
});

test('flow: struggle and sites nodes are multi-select with caps', () => {
    const f = reco.buildQuestionFlow({ struggle: ['websites'] }, deps);
    const struggle = f.find((n) => n.key === 'struggle');
    const sites = f.find((n) => n.key === 'sites');
    assert.strictEqual(struggle.type, 'multi');
    assert.strictEqual(struggle.cap, reco.RECO_STRUGGLE_LIMIT);
    assert.strictEqual(sites.type, 'multi');
    assert.ok(sites.cap >= 1);
});

// --- engine reactions to branch answers ---------------------------------

test('sites: presets fill block_domains with apex + www variants', () => {
    const k = keys({ struggle: ['websites'], sites: ['video'] });
    assert.strictEqual(k.enable_blocking, true);
    assert.ok(Array.isArray(k.block_domains), 'block_domains is a list');
    const domains = k.block_domains.map((d) => d.domain);
    assert.ok(domains.indexOf('youtube.com') !== -1, 'apex present');
    assert.ok(domains.indexOf('www.youtube.com') !== -1, 'www variant present');
});

test('sites: with no site presets chosen, blocking has no domains pre-filled', () => {
    const k = keys({ struggle: ['websites'] });
    assert.strictEqual(k.enable_blocking, true);
    assert.strictEqual(k.block_domains, undefined);
});

test('chimeInterval overrides the chime period', () => {
    assert.strictEqual(keys({ sound: 'chime', chimeInterval: '10' }).interval_chime_seconds, 600);
    // default still applies when unanswered
    assert.strictEqual(keys({ sound: 'chime' }).interval_chime_seconds, 300);
});

test('autobreak=yes adds an auto-break item that clears flow_extend', () => {
    const k = keys({ attention: 'flow', autobreak: 'yes' });
    assert.strictEqual(k.auto_start_after_pomodoro_ends, true);
    assert.strictEqual(k.break_breathing, true);
    assert.strictEqual(k.flow_extend, false); // overrides the flow item
});

test('autobreak=no leaves flow_extend on for a flow user', () => {
    const k = keys({ attention: 'flow', autobreak: 'no' });
    assert.strictEqual(k.flow_extend, true);
});

// ========================================================================
// Keyboard navigation mapping (Task 6)
// ========================================================================

test('keysymToOptionIndex maps digit row 1-9 to 0-8', () => {
    assert.strictEqual(reco.keysymToOptionIndex(0x031), 0); // '1'
    assert.strictEqual(reco.keysymToOptionIndex(0x035), 4); // '5'
    assert.strictEqual(reco.keysymToOptionIndex(0x039), 8); // '9'
});

test('keysymToOptionIndex maps keypad 1-9 to 0-8', () => {
    assert.strictEqual(reco.keysymToOptionIndex(0xffb1), 0); // KP_1
    assert.strictEqual(reco.keysymToOptionIndex(0xffb9), 8); // KP_9
});

test('keysymToOptionIndex returns -1 for non-digit keys', () => {
    assert.strictEqual(reco.keysymToOptionIndex(0x030), -1); // '0'
    assert.strictEqual(reco.keysymToOptionIndex(0xff0d), -1); // Return
    assert.strictEqual(reco.keysymToOptionIndex(0x020), -1); // space
});

// ------------------------------------------------------------------------
console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
