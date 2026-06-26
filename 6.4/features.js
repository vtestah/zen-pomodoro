const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
let Soup = null;
try {
    imports.gi.versions.Soup = '3.0';
    Soup = imports.gi.Soup;
} catch (e) {
    try { Soup = imports.gi.Soup; } catch (e2) { Soup = null; }
}
const Meta = imports.gi.Meta;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Util = imports.misc.util;
const ByteArray = imports.byteArray;
const Gettext = imports.gettext;
const ModalDialog = imports.ui.modalDialog;
const Dialog = imports.ui.dialog;
const CinnamonEntry = imports.ui.cinnamonEntry;

const UUID = "zen-pomodoro@vtestah";
function _(str) { return Gettext.dgettext(UUID, str); }

let C, SoundModule, DialogsModule;
if (typeof require !== 'undefined') {
    C = require('./constants');
    SoundModule = require('./sound');
    DialogsModule = require('./dialogs');
} else {
    const AppletDir = imports.ui.appletManager.applets[UUID];
    C = AppletDir.constants;
    SoundModule = AppletDir.sound;
    DialogsModule = AppletDir.dialogs;
}
const {
    POMODORO_STATE_FILE,
    POMODORO_STATE_MAX_AGE_MS,
    POMODORO_STATS_FILE,
    POMODORO_TASKS_DATA_FILE,
    POMODORO_HOSTS_HELPER_INSTALLED,
    POMODORO_HOSTS_POLICY_INSTALLED,
    POMODORO_HOSTS_FILE,
    POMODORO_HOSTS_BLOCK_BEGIN,
    POMODORO_HOSTS_BLOCK_END,
    POMODORO_FOCUS_FRAME_BOTTOM_SAFE,
    POMODORO_FOCUS_FRAME_NORMAL_STYLE,
    POMODORO_FOCUS_FRAME_WARNING_STYLE,
    POMODORO_BREAK_OVER_FRAME_STYLE,
    POMODORO_FOCUS_FRAME_PULSE_INTERVAL_MS,
    POMODORO_FOCUS_FRAME_TRANSITION,
    POMODORO_FOCUS_FRAME_PULSE_STYLES,
    POMODORO_BREAK_FRAME_PULSE_STYLES,
    POMODORO_FOCUS_FRAME_STYLE,
    POMODORO_PANEL_FOCUS_CUE_STYLE,
    POMODORO_PANEL_BREAK_CUE_STYLE,
    POMODORO_PANEL_FOCUS_LABEL_STYLE,
    POMODORO_PANEL_BREAK_LABEL_STYLE,
    POMODORO_FOCUS_TASK_CHIP_STYLE,
    POMODORO_FOCUS_TASK_CHIP_PAUSED_STYLE,
    POMODORO_FOCUS_CHIP_MARGIN,
    POMODORO_FOCUS_RITUAL_STYLE,
    POMODORO_FOCUS_RITUAL_FADE_IN_MS,
    POMODORO_FOCUS_RITUAL_HOLD_MS,
    POMODORO_FOCUS_RITUAL_FADE_OUT_MS,
    POMODORO_FOCUS_RITUAL_FRAME_FADE_MS,
    POMODORO_FOCUS_RITUAL_STEP_MS,
    POMODORO_FOCUS_GLOW_FOCUS_RGB,
    POMODORO_FOCUS_GLOW_FOCUS_END_RGB,
    POMODORO_FOCUS_GLOW_BREAK_RGB,
    POMODORO_FOCUS_GLOW_END_SHIFT_START,
    POMODORO_FOCUS_GLOW_DEPTH_RATIO,
    POMODORO_FOCUS_GLOW_DEPTH_MAX,
    POMODORO_FOCUS_GLOW_DEPTH_MIN,
    POMODORO_FOCUS_GLOW_MAX_ALPHA,
    POMODORO_FOCUS_GLOW_PROGRESS_WIDTH,
    POMODORO_FOCUS_GLOW_PROGRESS_ALPHA,
    POMODORO_FOCUS_GLOW_TRACK_ALPHA,
    POMODORO_FOCUS_GLOW_TICK_ALPHA,
    POMODORO_FOCUS_GLOW_TICK_RADIUS,
    POMODORO_FOCUS_GLOW_BREATH_BOOST,
    POMODORO_FOCUS_GLOW_BREATH_MS
} = C;

function install(proto) {
    proto._todayStr = function(d = new Date()) {
        return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
    };

    proto._loadDailyStatsAsync = function(onDone) {
        this._readJsonAsync(POMODORO_STATS_FILE, (parsed) => {
            let data = { date: "", count: 0, streak: 0, lastGoalMetDate: "", history: {}, total: 0, totalMinutes: 0, totalInterruptions: 0, hours: new Array(24).fill(0) };
            if (parsed && typeof parsed === "object") {
                data.date = parsed.date || "";
                data.count = parseInt(parsed.count) || 0;
                data.streak = parseInt(parsed.streak) || 0;
                data.lastGoalMetDate = parsed.lastGoalMetDate || "";
                if (parsed.history && typeof parsed.history === "object") {
                    for (let k in parsed.history) {
                        let v = parsed.history[k];
                        if (typeof v === "number") {
                            if (v > 0) {
                                data.history[k] = { c: parseInt(v) || 0, m: 0, i: 0 };
                            }
                        } else if (v && typeof v === "object") {
                            let c = parseInt(v.c) || 0;
                            let m = parseInt(v.m) || 0;
                            let ii = parseInt(v.i) || 0;
                            if (c > 0 || m > 0 || ii > 0) {
                                data.history[k] = { c: c, m: m, i: ii };
                            }
                        }
                    }
                }
                data.total = parseInt(parsed.total) || 0;
                data.totalMinutes = parseInt(parsed.totalMinutes) || 0;
                data.totalInterruptions = parseInt(parsed.totalInterruptions) || 0;
                if (Object.keys(data.history).length === 0 && data.date && data.count > 0) {
                    data.history[data.date] = { c: data.count, m: 0, i: 0 };
                }
                if (!data.total) {
                    let sum = 0;
                    for (let k in data.history) { sum += data.history[k].c; }
                    data.total = sum;
                }
                if (!data.totalMinutes) {
                    let sum = 0;
                    for (let k in data.history) { sum += data.history[k].m; }
                    data.totalMinutes = sum;
                }
                if (!data.totalInterruptions) {
                    let sum = 0;
                    for (let k in data.history) { sum += (data.history[k].i || 0); }
                    data.totalInterruptions = sum;
                }
                if (Array.isArray(parsed.hours)) {
                    for (let i = 0; i < 24; i++) { data.hours[i] = parseInt(parsed.hours[i]) || 0; }
                }
            }
            this._dailyStatsData = data;
            if (onDone) {
                onDone(data);
            }
        });
    };

    proto._refreshDailyStatsCache = function() {
        this._loadDailyStatsAsync((s) => {
            let today = this._todayStr();
            this._dailyCount = (s.date === today) ? s.count : 0;
            this._dailyStreak = s.streak || 0;
            if (typeof this._updateMenuRuntime === "function") {
                this._updateMenuRuntime();
            }
        });
    };

    proto._daysBetween = function(a, b) {
        let da = new Date(a + "T00:00:00");
        let db = new Date(b + "T00:00:00");
        return Math.round((db - da) / 86400000);
    };

    proto._recordPomodoroCompleted = function() {
        let today = this._todayStr();
        let yesterday = this._todayStr(new Date(Date.now() - 86400000));
        let s = this._dailyStatsData || { date: "", count: 0, streak: 0, lastGoalMetDate: "", history: {}, total: 0, totalMinutes: 0, totalInterruptions: 0, hours: new Array(24).fill(0) };
        if (!s.history) { s.history = {}; }
        if (typeof s.total !== "number") { s.total = 0; }
        if (typeof s.totalMinutes !== "number") { s.totalMinutes = 0; }
        if (typeof s.totalInterruptions !== "number") { s.totalInterruptions = 0; }
        if (!Array.isArray(s.hours) || s.hours.length !== 24) { s.hours = new Array(24).fill(0); }
        if (s.date !== today) {
            s.date = today;
            s.count = 0;
        }
        let dur = this._opt_pomodoroTimeMinutes || 25;
        s.count += 1;
        s.hours[new Date().getHours()] += 1;
        let cell = s.history[today] || { c: 0, m: 0, i: 0 };
        cell.c += 1;
        cell.m += dur;
        s.history[today] = cell;
        s.total += 1;
        s.totalMinutes += dur;
        // Keep the per-day history bounded (~18 weeks).
        let cutoff = this._todayStr(new Date(Date.now() - 126 * 86400000));
        for (let k in s.history) {
            if (k < cutoff) { delete s.history[k]; }
        }
        let goal = this._opt_dailyGoal || 0;
        if (goal > 0 && s.count === goal) {
            if (s.lastGoalMetDate === yesterday) {
                s.streak = (s.streak || 0) + 1;
            } else if (s.lastGoalMetDate !== today) {
                s.streak = 1;
            }
            s.lastGoalMetDate = today;
            // Celebrate locally (everyone), not only via Pushover.
            let body = _("%d focus blocks today — great work!").format(goal);
            if ((s.streak || 0) > 1) {
                body += "  " + _("\ud83d\udd25 %d-day streak").format(s.streak);
            }
            Main.notify(_("Daily goal reached \ud83c\udf45"), body);
            this._sendPushover(this._opt_pushoverMsgGoal, this._opt_pushoverSndGoal, this._opt_pushoverPriGoal);
            this._runEventCommand('goal');
        }
        this._dailyStatsData = s;
        this._writeJsonAsync(POMODORO_STATS_FILE, s);
        this._dailyCount = s.count;
        this._dailyStreak = s.streak || 0;
        this._updateMenuRuntime();
        this._incrementCurrentTaskProgress();
    };

    proto._recordInterruption = function() {
        let today = this._todayStr();
        let s = this._dailyStatsData || { date: "", count: 0, streak: 0, lastGoalMetDate: "", history: {}, total: 0, totalMinutes: 0, totalInterruptions: 0, hours: new Array(24).fill(0) };
        if (!s.history) { s.history = {}; }
        if (typeof s.totalInterruptions !== "number") { s.totalInterruptions = 0; }
        let cell = s.history[today] || { c: 0, m: 0, i: 0 };
        if (typeof cell.i !== "number") { cell.i = 0; }
        cell.i += 1;
        s.history[today] = cell;
        s.totalInterruptions += 1;
        this._dailyStatsData = s;
        this._writeJsonAsync(POMODORO_STATS_FILE, s);
        this._updateMenuRuntime();
    };

    // Rich stats: counts + focus time, current/longest active-day streak, best day,
    // and a 12-week heatmap (84 daily counts, oldest -> newest).
    proto._computeStats = function() {
        let h = (this._dailyStatsData && this._dailyStatsData.history) ? this._dailyStatsData.history : {};
        let cellOf = (d) => h[d] || { c: 0, m: 0 };
        let today = this._todayStr();
        let weekC = 0, weekM = 0, monthC = 0, monthM = 0, weekI = 0;
        for (let i = 0; i < 30; i++) {
            let cl = cellOf(this._todayStr(new Date(Date.now() - i * 86400000)));
            monthC += cl.c; monthM += cl.m;
            if (i < 7) { weekC += cl.c; weekM += cl.m; weekI += (cl.i || 0); }
        }
        let heatmap = [];
        for (let i = 83; i >= 0; i--) {
            heatmap.push(cellOf(this._todayStr(new Date(Date.now() - i * 86400000))).c);
        }
        let lastWeek = 0;
        for (let i = 7; i < 14; i++) {
            lastWeek += cellOf(this._todayStr(new Date(Date.now() - i * 86400000))).c;
        }
        let total = (this._dailyStatsData && this._dailyStatsData.total) || 0;
        let totalMinutes = (this._dailyStatsData && this._dailyStatsData.totalMinutes) || 0;
        let todayCell = cellOf(today);
        let best = 0;
        for (let k in h) { if (h[k].c > best) { best = h[k].c; } }
        let cur = 0;
        let startI = (todayCell.c > 0) ? 0 : 1;
        for (let i = startI; i < 400; i++) {
            if (cellOf(this._todayStr(new Date(Date.now() - i * 86400000))).c >= 1) { cur++; } else { break; }
        }
        let longest = 0, run = 0, prev = null;
        let activeDates = Object.keys(h).filter((k) => h[k].c >= 1).sort();
        for (let d of activeDates) {
            run = (prev && this._daysBetween(prev, d) === 1) ? run + 1 : 1;
            if (run > longest) { longest = run; }
            prev = d;
        }
        return {
            today: todayCell.c,
            todayMin: todayCell.m,
            week: weekC,
            weekMin: weekM,
            lastWeek: lastWeek,
            month: monthC,
            monthMin: monthM,
            total: total,
            totalMinutes: totalMinutes,
            interruptionsToday: (todayCell.i || 0),
            interruptionsWeek: weekI,
            interruptionsTotal: (this._dailyStatsData && this._dailyStatsData.totalInterruptions) || 0,
            streak: cur,
            longestStreak: longest,
            bestDay: best,
            heatmap: heatmap,
            hours: (this._dailyStatsData && Array.isArray(this._dailyStatsData.hours) && this._dailyStatsData.hours.length === 24) ? this._dailyStatsData.hours : new Array(24).fill(0)
        };
    };

    // ---- Tasks: estimate in pomodoros, per-task progress ----
    proto._defaultTasksData = function() {
        return { tasks: [], currentId: "", date: this._todayStr(), templates: [], distractions: [] };
    };

    proto._newTaskId = function() {
        return Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    };

    proto._loadTasksAsync = function(onDone) {
        this._readJsonAsync(POMODORO_TASKS_DATA_FILE, (parsed) => {
            let data = this._defaultTasksData();
            if (parsed && typeof parsed === "object" && Array.isArray(parsed.tasks)) {
                data.currentId = (typeof parsed.currentId === "string") ? parsed.currentId : "";
                data.date = (typeof parsed.date === "string") ? parsed.date : this._todayStr();
                for (let t of parsed.tasks) {
                    if (!t || typeof t !== "object") { continue; }
                    let title = (t.title || "").toString().trim();
                    if (!title) { continue; }
                    data.tasks.push({
                        id: (t.id || this._newTaskId()).toString(),
                        title: title.slice(0, 120),
                        est: Math.max(1, Math.min(99, parseInt(t.est) || 1)),
                        done: Math.max(0, parseInt(t.done) || 0),
                        doneToday: Math.max(0, parseInt(t.doneToday) || 0),
                        completed: Boolean(t.completed),
                        preset: this._sanitizeTaskPreset(t.preset)
                    });
                }
            }
            if (parsed && typeof parsed === "object" && Array.isArray(parsed.templates)) {
                for (let tpl of parsed.templates) {
                    if (!tpl || typeof tpl !== "object") { continue; }
                    let name = (tpl.name || "").toString().trim();
                    if (!name || !Array.isArray(tpl.tasks)) { continue; }
                    let tlist = [];
                    for (let tt of tpl.tasks) {
                        let ttl = (tt && tt.title || "").toString().trim();
                        if (ttl) { tlist.push({ title: ttl.slice(0, 120), est: Math.max(1, Math.min(99, parseInt(tt.est) || 1)) }); }
                    }
                    if (tlist.length) { data.templates.push({ name: name.slice(0, 80), tasks: tlist }); }
                }
            }
            if (parsed && typeof parsed === "object" && Array.isArray(parsed.distractions)) {
                for (let d of parsed.distractions) {
                    if (!d || typeof d !== "object") { continue; }
                    let text = (d.text || "").toString().trim();
                    if (!text) { continue; }
                    data.distractions.push({
                        id: (d.id || this._newTaskId()).toString(),
                        text: text.slice(0, 200),
                        ts: Math.max(0, parseInt(d.ts) || Date.now())
                    });
                }
            }
            let today = this._todayStr();
            if (data.date !== today) {
                for (let t of data.tasks) { t.doneToday = 0; }
                data.date = today;
            }
            this._tasksData = data;
            if (onDone) { onDone(data); }
        });
    };

    proto._saveTasks = function() {
        if (!this._tasksData) { this._tasksData = this._defaultTasksData(); }
        this._tasksData.date = this._todayStr();
        this._writeJsonAsync(POMODORO_TASKS_DATA_FILE, this._tasksData);
    };

    proto._taskList = function() {
        return (this._tasksData && Array.isArray(this._tasksData.tasks)) ? this._tasksData.tasks : [];
    };

    proto._currentTask = function() {
        if (!this._tasksData || !this._tasksData.currentId) { return null; }
        return this._taskList().find((t) => t.id === this._tasksData.currentId) || null;
    };

    // A snapshot of the timer's current rhythm, used as the default preset for
    // new tasks and to label "what's active right now".
    proto._currentPresetSnapshot = function() {
        return {
            name: this._getActivePresetLabel(),
            pomodoro: this._opt_pomodoroTimeMinutes || 25,
            short_break: this._opt_shortBreakTimeMinutes || 5,
            long_break: this._opt_longBreakTimeMinutes || 15,
            pomodori: this._opt_pomodoriNumber || 4
        };
    };

    proto._sanitizeTaskPreset = function(p) {
        if (!p || typeof p !== "object") { return null; }
        let pom = parseInt(p.pomodoro) || 0, sb = parseInt(p.short_break) || 0,
            lb = parseInt(p.long_break) || 0, n = parseInt(p.pomodori) || 0;
        if (pom <= 0 || sb <= 0 || lb <= 0 || n <= 0) { return null; }
        return { name: (p.name || "").toString().slice(0, 80), pomodoro: pom, short_break: sb, long_break: lb, pomodori: n };
    };

    // Apply a task's saved rhythm to the timer when it becomes current — but
    // only while idle, so we never reshape a running pomodoro.
    proto._applyTaskPreset = function(t) {
        if (!t || !t.preset) { return; }
        if (this._timerQueue && (this._timerQueue.isRunning() || this._isPausedState())) { return; }
        let p = t.preset;
        this._applyDurationPreset(p.pomodoro, p.short_break, p.long_break, p.pomodori, true);
    };

    // Save a preset onto the current task (used when picking a preset from the
    // menu while a task is current).
    proto._saveCurrentTaskPreset = function(preset) {
        let t = this._currentTask();
        if (!t) { return false; }
        let p = this._sanitizeTaskPreset(preset);
        if (!p) { return false; }
        t.preset = p;
        this._saveTasks();
        this._refreshTasksMenu();
        return true;
    };

    proto._addTask = function(title, est, preset) {
        title = (title || "").toString().trim();
        if (!title) { return; }
        if (!this._tasksData) { this._tasksData = this._defaultTasksData(); }
        let task = {
            id: this._newTaskId(),
            title: title.slice(0, 120),
            est: Math.max(0, Math.min(99, parseInt(est) || 0)),
            done: 0, doneToday: 0, completed: false,
            preset: this._sanitizeTaskPreset(preset) || this._currentPresetSnapshot()
        };
        this._tasksData.tasks.push(task);
        if (!this._tasksData.currentId) {
            this._tasksData.currentId = task.id;
            this._currentFocusTask = task.title;
            this._applyTaskPreset(task);
        }
        this._saveTasks();
        this._refreshTasksMenu();
    };

    proto._setCurrentTaskId = function(id) {
        if (!this._tasksData) { this._tasksData = this._defaultTasksData(); }
        this._tasksData.currentId = id || "";
        let t = this._currentTask();
        this._currentFocusTask = t ? t.title : "";
        this._applyTaskPreset(t);
        this._saveTasks();
        this._refreshTasksMenu();
    };

    proto._editTask = function(id, title, est, preset) {
        let t = this._taskList().find((x) => x.id === id);
        if (!t) { return; }
        title = (title || "").toString().trim();
        if (title) { t.title = title.slice(0, 120); }
        let pe = parseInt(est);
        t.est = Math.max(0, Math.min(99, isNaN(pe) ? (t.est || 0) : pe));
        let p = this._sanitizeTaskPreset(preset);
        if (p) { t.preset = p; }
        if (this._tasksData && this._tasksData.currentId === id) {
            this._currentFocusTask = t.title;
            this._applyTaskPreset(t);
        }
        this._saveTasks();
        this._refreshTasksMenu();
    };

    proto._toggleTaskCompleted = function(id) {
        let t = this._taskList().find((x) => x.id === id);
        if (!t) { return; }
        t.completed = !t.completed;
        // Celebrate only a meaningful completion: estimate met, or >=1 pomodoro.
        if (t.completed) {
            let earned = (t.est > 0) ? ((t.done || 0) >= t.est) : ((t.done || 0) >= 1);
            if (earned && typeof this._celebrateTaskDone === 'function') {
                this._celebrateTaskDone(t);
            }
        }
        this._saveTasks();
        this._refreshTasksMenu();
    };

    proto._deleteTask = function(id) {
        if (!this._tasksData) { return; }
        this._tasksData.tasks = this._taskList().filter((t) => t.id !== id);
        if (this._tasksData.currentId === id) { this._tasksData.currentId = ""; }
        this._saveTasks();
        this._refreshTasksMenu();
    };

    proto._ensureReorderDialog = function() {
        if (!this._reorderDialog) {
            this._reorderDialog = new DialogsModule.PomodoroReorderDialog();
        }
        return this._reorderDialog;
    };

    proto._openReorderTasks = function() {
        let all = this._taskList() || [];
        if (all.length < 2) { return; }
        let items = all.map((t) => ({
            key: t.id,
            label: (t.completed ? "\u2713 " : "") + t.title + (t.est > 0 ? ("   " + (t.doneToday || 0) + "/" + t.est + " \ud83c\udf45") : "")
        }));
        this._ensureReorderDialog().openReorder(_("Reorder tasks"), items, (order) => this._reorderTasks(order));
    };

    // Reorder active tasks to match the given id order; completed/other tasks
    // keep their relative order after them. Pure given _tasksData.tasks.
    proto._reorderTasks = function(orderedIds) {
        if (!this._tasksData || !Array.isArray(this._tasksData.tasks)) { return; }
        let byId = {};
        for (let t of this._tasksData.tasks) { byId[t.id] = t; }
        let inSet = new Set(orderedIds);
        let reordered = orderedIds.map((id) => byId[id]).filter(Boolean);
        let rest = this._tasksData.tasks.filter((t) => !inSet.has(t.id));
        this._tasksData.tasks = reordered.concat(rest);
        this._saveTasks();
        this._refreshTasksMenu();
    };

    proto._openReorderPresets = function() {
        let list = this._presetList() || [];
        if (list.length < 2) { return; }
        let items = list.map((p) => ({
            key: p.name,
            label: p.name + "   " + p.pomodoro + "/" + p.short_break + "/" + p.long_break + " \u00d7" + p.pomodori
        }));
        this._ensureReorderDialog().openReorder(_("Reorder presets"), items, (order) => this._reorderPresets(order));
    };

    // Reorder presets to match the given name order, materializing the built-in
    // defaults into custom_presets when none were saved yet.
    proto._reorderPresets = function(orderedNames) {
        let base = (this._opt_customPresets && this._opt_customPresets.length)
            ? this._opt_customPresets.slice() : (this._presetList() || []).slice();
        let byName = {};
        for (let p of base) { byName[p.name] = p; }
        let inSet = new Set(orderedNames);
        let reordered = orderedNames.map((n) => byName[n]).filter(Boolean);
        let rest = base.filter((p) => !inSet.has(p.name));
        let final = reordered.concat(rest);
        try { this._settingsProvider.setValue('custom_presets', final); } catch (e) {}
        if (typeof this._updatePresetIndicator === 'function') { this._updatePresetIndicator(); }
    };

    proto._incrementCurrentTaskProgress = function() {
        let t = this._currentTask();
        if (!t) { return; }
        t.done = (t.done || 0) + 1;
        t.doneToday = (t.doneToday || 0) + 1;
        // The estimate is a real target: gently suggest closing when it's hit.
        if (!t.completed && t.est > 0 && t.doneToday === t.est) {
            Main.notify(_("Hit your %d 🍅 estimate for: %s. Mark it done when ready.").format(t.est, t.title));
        }
        this._saveTasks();
        this._refreshTasksMenu();
    };

    proto._refreshTasksMenu = function() {
        if (this._appletMenu && typeof this._appletMenu.setTasks === "function") {
            let est = this._estimateFinish();
            let finishText = est ? _("\u2248 finish %s \u00b7 %d \ud83c\udf45 left").format(est.time, est.remaining) : "";
            this._appletMenu.setTasks(this._taskList(), this._tasksData ? this._tasksData.currentId : "", finishText, (this._tasksData && this._tasksData.templates) || []);
        }
    };

    proto._estimateFinish = function() {
        let remaining = 0, focusMins = 0;
        let work = this._opt_pomodoroTimeMinutes || 25;
        for (let t of this._taskList()) {
            if (t.completed) { continue; }
            let left = (t.est || 0) - (t.doneToday || 0);
            if (left > 0) {
                remaining += left;
                let f = (t.preset && t.preset.pomodoro) ? t.preset.pomodoro : work;
                focusMins += left * f;
            }
        }
        if (remaining <= 0) { return null; }
        let brk = this._opt_shortBreakTimeMinutes || 5;
        let mins = focusMins + Math.max(0, remaining - 1) * brk;
        let end = new Date(Date.now() + mins * 60000);
        let hh = end.getHours().toString().padStart(2, '0');
        let mm = end.getMinutes().toString().padStart(2, '0');
        return { remaining: remaining, mins: mins, time: `${hh}:${mm}` };
    };

    // A short, calm suggestion for what to actually do on a break — the part
    // most timers skip. Rotates so it doesn't feel repetitive.
    proto._distractionList = function() {
        return (this._tasksData && Array.isArray(this._tasksData.distractions)) ? this._tasksData.distractions : [];
    };

    proto._addDistraction = function(text) {
        let t = (text || "").toString().trim();
        if (!t) { return; }
        if (!this._tasksData) { this._tasksData = this._defaultTasksData(); }
        if (!Array.isArray(this._tasksData.distractions)) { this._tasksData.distractions = []; }
        this._tasksData.distractions.push({ id: this._newTaskId(), text: t.slice(0, 200), ts: Date.now() });
        this._saveTasks();
        this._refreshDistractions();
    };

    proto._deleteDistraction = function(id) {
        if (!this._tasksData || !Array.isArray(this._tasksData.distractions)) { return; }
        this._tasksData.distractions = this._tasksData.distractions.filter((d) => d.id !== id);
        this._saveTasks();
        this._refreshDistractions();
    };

    proto._clearDistractions = function() {
        if (!this._tasksData) { return; }
        this._tasksData.distractions = [];
        this._saveTasks();
        this._refreshDistractions();
    };

    proto._refreshDistractions = function() {
        if (this._appletMenu && typeof this._appletMenu.setDistractions === 'function') {
            this._appletMenu.setDistractions(this._distractionList());
        }
    };

    // Lightweight quick-capture: a small focused input (no screen-dimming modal)
    // so you can jot a distracting thought and get straight back to work.
    // Opened by the global hotkey or from the menu. Enter saves; Esc / click
    // outside dismisses.
    proto._showDistractionCapture = function() {
        if (this._capturePopover) {
            if (this._captureEntry) { this._captureEntry.grab_key_focus(); }
            return;
        }
        let monitor = Main.layoutManager.focusMonitor || Main.layoutManager.primaryMonitor;
        let container = new St.BoxLayout({ vertical: true, reactive: true });
        container.set_position(monitor.x, monitor.y);
        container.set_size(monitor.width, monitor.height);

        let card = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.START,
            style: 'background-color: rgba(40,40,40,0.97); border: 1px solid rgba(227,90,60,0.55); border-radius: 12px; padding: 16px; spacing: 8px; margin-top: ' + Math.floor(monitor.height * 0.26) + 'px;'
        });
        card.add_child(new St.Label({ text: _("Capture distraction"), style: 'color: #f5f5f5; font-weight: bold;' }));
        let entry = new St.Entry({ style_class: 'run-dialog-entry', can_focus: true, style: 'min-width: 380px;' });
        let hint = new St.Label({ text: _("Type it, press Enter — then back to work") });
        entry.set_hint_actor(hint);
        entry.clutter_text.connect('key-focus-in', () => hint.hide());
        entry.clutter_text.connect('key-focus-out', () => { if (!entry.get_text()) { hint.show(); } });
        CinnamonEntry.addContextMenu(entry);
        card.add_child(entry);
        container.add_child(card);

        Main.uiGroup.add_actor(container);
        let pushed = false;
        try { pushed = Main.pushModal(container); } catch (e) { pushed = false; }

        this._capturePopover = container;
        this._captureEntry = entry;
        let self = this;
        let closed = false;
        let close = function() {
            if (closed) { return; }
            closed = true;
            try { if (pushed) { Main.popModal(container); } } catch (e) {}
            container.destroy();
            self._capturePopover = null;
            self._captureEntry = null;
        };
        entry.clutter_text.connect('activate', () => {
            let txt = entry.get_text();
            if (txt && txt.trim()) { self._addDistraction(txt); }
            close();
        });
        container.connect('key-press-event', (a, ev) => {
            if (ev.get_key_symbol() === Clutter.KEY_Escape) { close(); return true; }
            return false;
        });
        container.connect('button-press-event', (a, ev) => {
            let [px, py] = ev.get_coords();
            let [cx, cy] = card.get_transformed_position();
            if (px < cx || px > cx + card.get_width() || py < cy || py > cy + card.get_height()) { close(); return true; }
            return false;
        });
        entry.grab_key_focus();
        // The placeholder must dim the entry's own (white) text colour, not the
        // dark card's, so it stays legible inside the input field.
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            try {
                let ec = entry.get_theme_node().get_foreground_color();
                hint.set_style("color: rgba(" + ec.red + ", " + ec.green + ", " + ec.blue + ", 0.55);");
            } catch (e) {}
            return GLib.SOURCE_REMOVE;
        });
    };

    proto._restTip = function(isLong) {
        let shortTips = [
            _("Look ~20 ft away for 20 seconds — rest your eyes."),
            _("Stand up and stretch."),
            _("Drink some water."),
            _("Look out a window and relax your shoulders."),
            _("Close your eyes and take a few slow breaths."),
            _("Step away from screens — don't check your phone."),
            _("Unclench your jaw and drop your shoulders.")
        ];
        let longTips = [
            _("Take a short walk."),
            _("Step outside for some fresh air."),
            _("Stretch and move around a little."),
            _("Grab a snack and some water."),
            _("Rest your eyes and look into the distance."),
            _("Rest away from screens — no phone, no feeds, no news."),
            _("Move your body and let your mind wander.")
        ];
        let tips = isLong ? longTips : shortTips;
        // Rotate through tips rather than repeating the same one.
        this._restTipIndex = ((this._restTipIndex || 0) + 1) % 1000;
        return tips[this._restTipIndex % tips.length];
    };

    proto._showAddTaskDialog = function(existing) {
        let dialog = new ModalDialog.ModalDialog({ destroyOnClose: true });
        let content = new Dialog.MessageDialogContent({
            title: existing ? _("Edit task") : _("New task"),
            description: _("What do you want to work on?")
        });
        let entry = new St.Entry({ style_class: 'run-dialog-entry', can_focus: true });
        let entryHint = new St.Label({ text: _("e.g. Write the report") });
        entry.set_hint_actor(entryHint);
        entry.clutter_text.connect('key-focus-in', () => entryHint.hide());
        entry.clutter_text.connect('key-focus-out', () => { if (!entry.get_text()) { entryHint.show(); } });
        CinnamonEntry.addContextMenu(entry);
        if (existing && existing.title) { entry.set_text(existing.title); }
        content.add_child(entry);

        let est = { value: existing ? Math.max(0, Math.min(99, existing.est || 0)) : 0 };
        let taskPreset = (existing && this._sanitizeTaskPreset(existing.preset)) || this._currentPresetSnapshot();
        let focusLen = taskPreset.pomodoro || 25;
        let fmtMins = (mins) => {
            let h = Math.floor(mins / 60), m = mins % 60;
            if (h > 0) { return m > 0 ? _("%d h %d min").format(h, m) : _("%d h").format(h); }
            return _("%d min").format(m);
        };
        let qLabel = new St.Label({ text: '', style: 'padding-top: 10px;' });
        content.add_child(qLabel);
        // A pomodoro's length comes from the active preset. You can switch the
        // preset right here — the estimate stays counted in pomodoros, only the
        // minutes change. "Custom" lights up when durations match no preset.
        let presetList = this._presetList();
        let presetRow = new St.BoxLayout({ vertical: false, style: 'spacing: 6px; padding-top: 4px;' });
        let presetKeyLabel = new St.Label({ text: _("Preset") + ":", style: 'padding-top: 3px; color: rgba(255,255,255,0.6);' });
        presetRow.add(presetKeyLabel);
        let presetBtns = [];
        let customChip = new St.Label({ text: _("Custom") });

        let estRow = new St.BoxLayout({ vertical: false, style: 'spacing: 6px; padding-top: 4px;' });
        let estBtns = [];
        let estVals = [0, 1, 2, 3, 4, 5, 6];
        let estReadout = new St.Label({ text: '', style: 'padding-top: 4px; color: rgba(255,255,255,0.6);' });
        let plusBtn = new St.Button({ label: "+", style_class: 'button' });
        let restyle = () => {
            focusLen = taskPreset.pomodoro || 25;
            qLabel.set_text(_("How many pomodoros? (1 🍅 = %d min)").format(focusLen));
            for (let k = 0; k < estBtns.length; k++) {
                estBtns[k].set_style('padding: 2px 8px; border-radius: 6px;' + ((estVals[k] === est.value) ? ' background-color: rgba(227,90,60,0.55);' : ''));
            }
            plusBtn.set_style('padding: 2px 8px; border-radius: 6px;' + ((est.value > 6) ? ' background-color: rgba(227,90,60,0.55);' : ''));
            let prefix = (est.value > 6) ? (est.value + " \ud83c\udf45 \u00b7 ") : "";
            estReadout.set_text(est.value === 0 ? _("No estimate — just counts your 🍅") : (prefix + fmtMins(est.value * focusLen)));
            let active = taskPreset.name;
            let matched = false;
            for (let pb of presetBtns) {
                let on = (pb.preset.name === active);
                if (on) { matched = true; }
                pb.btn.set_style('padding: 2px 8px; border-radius: 6px;' + (on ? ' background-color: rgba(227,90,60,0.55);' : ''));
            }
            if (matched) { customChip.hide(); } else { customChip.show(); }
            customChip.set_style('padding: 2px 8px; border-radius: 6px;' + (matched ? '' : ' background-color: rgba(227,90,60,0.55);'));
        };
        presetList.forEach((p) => {
            let b = new St.Button({ label: p.name, style_class: 'button' });
            b.connect('clicked', () => {
                taskPreset = { name: p.name, pomodoro: p.pomodoro, short_break: p.short_break, long_break: p.long_break, pomodori: p.pomodori };
                restyle();
            });
            presetBtns.push({ btn: b, preset: p });
            presetRow.add(b);
        });
        presetRow.add(customChip);
        content.add_child(presetRow);
        estVals.forEach((v) => {
            let b = new St.Button({ label: (v === 0 ? "\u2014" : (v + " \ud83c\udf45")), style_class: 'button' });
            b.connect('clicked', () => { est.value = v; restyle(); });
            estBtns.push(b);
            estRow.add(b);
        });
        plusBtn.connect('clicked', () => { est.value = Math.min(99, Math.max(est.value, 6) + 1); restyle(); });
        estRow.add(plusBtn);
        restyle();
        content.add_child(estRow);
        content.add_child(estReadout);

        // Secondary text here (placeholder, "Preset:" caption, estimate readout) is
        // fixed-white for dark themes; recolour it from the dialog's own theme
        // foreground on open so it stays legible on light themes too.
        dialog.connect('opened', () => {
            try {
                let c = content.get_theme_node().get_foreground_color();
                let dim = "color: rgba(" + c.red + ", " + c.green + ", " + c.blue + ", 0.6);";
                presetKeyLabel.set_style("padding-top: 3px; " + dim);
                estReadout.set_style("padding-top: 4px; " + dim);
                // The placeholder sits inside the entry, which has its own (often
                // white) background — so dim the ENTRY's text colour, not the
                // dialog's, or it washes out.
                let ec = entry.get_theme_node().get_foreground_color();
                entryHint.set_style("color: rgba(" + ec.red + ", " + ec.green + ", " + ec.blue + ", 0.55);");
            } catch (e) {}
        });

        dialog.contentLayout.add(content);
        dialog.setInitialKeyFocus(entry.clutter_text);
        let confirm = () => {
            let t = entry.clutter_text.get_text().trim();
            dialog.close();
            if (t) {
                if (existing) { this._editTask(existing.id, t, est.value, taskPreset); }
                else { this._addTask(t, est.value, taskPreset); }
            }
        };
        entry.clutter_text.connect('key-press-event', (actor, ev) => {
            let s = ev.get_key_symbol();
            if (s === Clutter.KEY_Return || s === Clutter.KEY_KP_Enter) { confirm(); return true; }
            return false;
        });
        dialog.setButtons([
            { label: _("Cancel"), key: Clutter.KEY_Escape, action: () => dialog.close() },
            { label: existing ? _("Save") : _("Add"), default: true, action: confirm }
        ]);
        dialog.open();
    };

    // Add or edit a timer preset (name + focus / short / long / pomodori),
    // managed straight from the menu's Preset submenu.
    proto._showPresetDialog = function(existing, index) {
        let dialog = new ModalDialog.ModalDialog({ destroyOnClose: true });
        let content = new Dialog.MessageDialogContent({
            title: existing ? _("Edit preset") : _("New preset"),
            description: _("Name it and set its rhythm.")
        });
        let entry = new St.Entry({ style_class: 'run-dialog-entry', can_focus: true });
        let entryHint = new St.Label({ text: _("e.g. Deep work") });
        entry.set_hint_actor(entryHint);
        entry.clutter_text.connect('key-focus-in', () => entryHint.hide());
        entry.clutter_text.connect('key-focus-out', () => { if (!entry.get_text()) { entryHint.show(); } });
        CinnamonEntry.addContextMenu(entry);
        if (existing && existing.name) { entry.set_text(existing.name); }
        content.add_child(entry);
        dialog.connect('opened', () => { try { let ec = entry.get_theme_node().get_foreground_color(); entryHint.set_style("color: rgba(" + ec.red + ", " + ec.green + ", " + ec.blue + ", 0.55);"); } catch (e) {} });

        let vals = {
            pomodoro: existing ? (parseInt(existing.pomodoro) || 25) : 25,
            short_break: existing ? (parseInt(existing.short_break) || 5) : 5,
            long_break: existing ? (parseInt(existing.long_break) || 15) : 15,
            pomodori: existing ? (parseInt(existing.pomodori) || 4) : 4
        };
        let minFmt = (v) => _("%d min").format(v);
        let numFmt = (v) => "" + v;
        let mkStepper = (labelText, key, min, max, step, fmt) => {
            let row = new St.BoxLayout({ vertical: false, style: 'spacing: 8px; padding-top: 6px;' });
            row.add(new St.Label({ text: labelText, style: 'min-width: 150px; padding-top: 4px;' }));
            let minus = new St.Button({ label: "\u2212", style_class: 'button', style: 'padding: 2px 12px;' });
            let valLab = new St.Label({ text: fmt(vals[key]), style: 'min-width: 64px; padding-top: 4px; text-align: center;' });
            let plus = new St.Button({ label: "+", style_class: 'button', style: 'padding: 2px 12px;' });
            minus.connect('clicked', () => { vals[key] = Math.max(min, vals[key] - step); valLab.set_text(fmt(vals[key])); });
            plus.connect('clicked', () => { vals[key] = Math.min(max, vals[key] + step); valLab.set_text(fmt(vals[key])); });
            row.add(minus); row.add(valLab); row.add(plus);
            content.add_child(row);
        };
        mkStepper(_("Focus (min)"), 'pomodoro', 1, 180, 5, minFmt);
        mkStepper(_("Short break (min)"), 'short_break', 1, 120, 5, minFmt);
        mkStepper(_("Long break (min)"), 'long_break', 1, 180, 5, minFmt);
        mkStepper(_("Pomodori"), 'pomodori', 1, 16, 1, numFmt);

        dialog.contentLayout.add(content);
        dialog.setInitialKeyFocus(entry.clutter_text);
        let confirm = () => {
            let name = entry.clutter_text.get_text().trim();
            dialog.close();
            if (!name) { return; }
            if (existing) { this._editPreset(index, name, vals.pomodoro, vals.short_break, vals.long_break, vals.pomodori); }
            else { this._addPreset(name, vals.pomodoro, vals.short_break, vals.long_break, vals.pomodori); }
        };
        entry.clutter_text.connect('key-press-event', (actor, ev) => {
            let s = ev.get_key_symbol();
            if (s === Clutter.KEY_Return || s === Clutter.KEY_KP_Enter) { confirm(); return true; }
            return false;
        });
        dialog.setButtons([
            { label: _("Cancel"), key: Clutter.KEY_Escape, action: () => dialog.close() },
            { label: existing ? _("Save") : _("Add"), default: true, action: confirm }
        ]);
        dialog.open();
    };

    // Recommendation engine for the smart onboarding wizard. Pure function:
    // takes the user's answers and derives a tailored set of settings plus a
    // human-readable list of reasons. No side effects — the wizard applies the
    // returned settings only when the user accepts.
    proto._computeFocusPlan = function(a) {
        a = a || {};
        let work = a.work || 'study';
        let attention = a.attention || 'medium';
        let struggle = a.struggle || 'none';
        let sound = a.sound || 'silence';
        let load = a.load || 'light';
        let clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

        // Base rhythm from how long the person can concentrate.
        let base = ({
            short:  { f: 15, s: 5,  l: 15, n: 4 },
            medium: { f: 25, s: 5,  l: 15, n: 4 },
            long:   { f: 50, s: 10, l: 20, n: 4 },
            flow:   { f: 50, s: 10, l: 20, n: 3 }
        })[attention] || { f: 25, s: 5, l: 15, n: 4 };
        let f = base.f, s = base.s, l = base.l, n = base.n;

        // Nudge the rhythm toward the kind of work.
        if (work === 'deep') { if (f <= 25) { f += 5; } }      // a little longer to ramp up
        else if (work === 'creative') { l += 5; }              // longer breaks let ideas settle
        else if (work === 'admin') { f = Math.max(15, f - 5); } // quicker cycles for small tasks

        f = clamp(f, 1, 60); s = clamp(s, 1, 15); l = clamp(l, 1, 60); n = clamp(n, 1, 10);

        let set = {
            pomodoro_duration: f,
            short_break_duration: s,
            long_break_duration: l,
            pomodori_number: n
        };
        let reasons = [];
        let why = (t) => reasons.push(t);

        let workReason = ({
            deep: _("longer focus blocks suit deep work"),
            study: _("the classic rhythm suits studying"),
            creative: _("a little more break time lets ideas settle"),
            admin: _("shorter cycles keep small tasks moving")
        })[work] || _("a balanced rhythm");
        why(_("Focus rhythm %d / %d / %d min — %s.").format(f, s, l, workReason));

        // Daily goal from how much they want to do.
        let goal = ({ try: 0, light: 4, full: 6, push: 8 })[load];
        if (goal === undefined) { goal = 4; }
        set.daily_goal = goal;
        if (goal > 0) { why(_("Daily goal: %d focus blocks.").format(goal)); }
        else { why(_("No daily goal yet — just getting a feel for it.")); }

        // Flow extension helps deep work / natural flow; off for anyone who overworks.
        if (attention === 'flow' || work === 'deep') {
            set.flow_extend = true;
            set.flow_extend_minutes = 10;
        }

        // Soundscape / environment.
        if (sound === 'silence') {
            set.timer_sound = false; set.interval_chime = false; set.focus_ambient_choice = 'off';
            why(_("Silent focus — no ticking or chimes."));
        } else if (sound === 'ambient') {
            set.focus_ambient_choice = 'brown'; set.focus_ambient_volume = 40;
            set.timer_sound = false; set.interval_chime = false;
            why(_("Soft brown-noise ambience while you focus."));
        } else if (sound === 'chime') {
            set.interval_chime = true;
            set.interval_chime_seconds = (attention === 'short') ? 180 : 300;
            set.timer_sound = false;
            why(_("A gentle chime every %d min to mark time.").format(Math.round(set.interval_chime_seconds / 60)));
        } else if (sound === 'shared') {
            set.timer_sound = false; set.interval_chime = false; set.focus_ambient_choice = 'off';
            set.start_sound = false; set.break_sound = false;
            set.focus_show_task_chip = true; set.focus_dnd = true;
            why(_("Quiet, visual-only cues for a shared space."));
        }

        // The main obstacle decides which assist to switch on.
        if (struggle === 'notifications') {
            set.focus_dnd = true;
            why(_("Notifications are muted while you focus."));
        } else if (struggle === 'websites') {
            set.enable_blocking = true;
            why(_("Distraction blocking is ready — add sites in Settings → Advanced."));
        } else if (struggle === 'starting') {
            set.start_on_click = true; set.focus_start_ritual = true; set.require_focus_task = false;
            why(_("One-click start and a calm start ritual make it easier to begin."));
        } else if (struggle === 'overwork') {
            set.auto_start_after_pomodoro_ends = true; set.show_dialog_messages = true;
            set.break_breathing = true; set.flow_extend = false;
            why(_("Breaks start on their own so you don't overwork."));
        } else if (struggle === 'anxiety') {
            set.focus_calm_ending = true; set.show_seconds = false; set.warn_sound = false;
            set.theme_preset = 'cool'; set.breathing_pattern = 'relax'; set.frame_style = 'glow';
            why(_("A calm theme, no ticking seconds and no end-of-timer rush."));
        }

        return { settings: set, reasons: reasons };
    };

    // Smart, adaptive onboarding: ask a few diagnostic questions, then compute
    // and apply a tailored setup instead of making the user pick raw presets.
    // A short, persistent explanation of the technique (Settings button), so it
    // is available without re-running the onboarding wizard.
    proto._showAboutTechnique = function() {
        let dialog = new ModalDialog.ModalDialog({ destroyOnClose: true });
        let box = new St.BoxLayout({ vertical: true, style: 'spacing: 9px; width: 540px; padding: 8px 16px;' });
        dialog.contentLayout.add(box);
        box.add(new St.Label({ text: _("The Pomodoro technique \ud83c\udf45"), style: 'font-size: 1.35em; font-weight: bold;' }));
        let para = (s) => { let l = new St.Label({ text: s }); l.clutter_text.line_wrap = true; box.add(l); };
        para(_("Work in short, focused sprints with deliberate rest between them:"));
        para(_("\u2022 Focus for about 25 minutes on a single task.\n\u2022 Take a 5-minute break.\n\u2022 After four sprints, take a longer 15–30 minute break."));
        para(_("Why it works: a finite countdown keeps the task approachable, frequent breaks protect your attention, and finishing each sprint builds momentum without burnout."));
        para(_("Tip: pick one task per sprint. If something distracts you, jot it down and come back to it on the break."));
        dialog.setButtons([{ label: _("Close"), default: true, action: () => dialog.close() }]);
        dialog.open();
    };

    proto._showOnboardingWizard = function() {
        let dialog = new ModalDialog.ModalDialog({ destroyOnClose: true });
        let sp = this._settingsProvider;
        let answers = {};
        let st = { step: 0 };
        let content = new St.BoxLayout({ vertical: true, style: 'spacing: 10px; width: 560px; padding: 6px 14px;' });
        dialog.contentLayout.add(content);

        let title = (s) => new St.Label({ text: s, style: 'font-size: 1.35em; font-weight: bold;' });
        let para = (s) => { let l = new St.Label({ text: s }); l.clutter_text.line_wrap = true; return l; };
        let BASE = 'margin: 5px 0 0 0; padding: 9px 14px; border-radius: 8px;';
        let SEL = BASE + ' background-color: rgba(227,90,60,0.92); color: #ffffff; font-weight: bold; border: 1px solid #e3593c;';

        // A single-select question: full-width option rows, highlight in place.
        let ask = (key, opts) => {
            let col = new St.BoxLayout({ vertical: true, style: 'spacing: 2px;' });
            let btns = [];
            opts.forEach((o) => {
                let b = new St.Button({ x_expand: true, style_class: 'button' });
                b.set_label(o.label);
                b.set_style(answers[key] === o.value ? SEL : BASE);
                b.connect('clicked', () => {
                    answers[key] = o.value;
                    btns.forEach((x) => x.b.set_style(x.v === o.value ? SEL : BASE));
                });
                btns.push({ b: b, v: o.value });
                col.add(b);
            });
            return col;
        };

        let QUESTIONS = [
            { key: 'work', title: _("What will you mainly focus on?"),
              help: _("This shapes how long each focus block should be."),
              opts: [
                { value: 'deep',     label: _("Deep work or coding") },
                { value: 'study',    label: _("Studying or reading") },
                { value: 'creative', label: _("Writing or creative work") },
                { value: 'admin',    label: _("Lots of small tasks") }
              ] },
            { key: 'attention', title: _("How long can you usually concentrate?"),
              help: _("Pick a length you can actually keep — it beats an ideal one."),
              opts: [
                { value: 'short',  label: _("About 15 minutes") },
                { value: 'medium', label: _("About 25 minutes") },
                { value: 'long',   label: _("45 minutes or more") },
                { value: 'flow',   label: _("I lose track of time when I'm in flow") }
              ] },
            { key: 'struggle', title: _("What gets in your way most?"),
              help: _("I'll switch on the right help for this."),
              opts: [
                { value: 'notifications', label: _("Notifications and pings") },
                { value: 'websites',      label: _("Distracting websites") },
                { value: 'starting',      label: _("It's hard to get started") },
                { value: 'overwork',      label: _("I forget to take breaks") },
                { value: 'anxiety',       label: _("Timers make me anxious") }
              ] },
            { key: 'sound', title: _("What helps you concentrate?"),
              help: _("Sets the focus soundscape — change it anytime in Sounds."),
              opts: [
                { value: 'silence', label: _("Silence") },
                { value: 'ambient', label: _("Soft background noise") },
                { value: 'chime',   label: _("A gentle chime to mark time") },
                { value: 'shared',  label: _("I share my space — keep it quiet") }
              ] },
            { key: 'load', title: _("How much do you want to get done today?"),
              help: _("Sets your daily goal — no pressure, you can change it."),
              opts: [
                { value: 'try',   label: _("Just trying it out") },
                { value: 'light', label: _("A light day (about 4)") },
                { value: 'full',  label: _("A full day (about 6)") },
                { value: 'push',  label: _("A big push (about 8)") }
              ] }
        ];
        let TOTAL = QUESTIONS.length + 2; // intro + questions + review

        let finish = () => { try { sp.setValue('onboarding_done', true); } catch (e) {} dialog.close(); };
        let applyPlan = (plan, thenStart) => {
            Object.keys(plan.settings).forEach((k) => { try { sp.setValue(k, plan.settings[k]); } catch (e) {} });
            try { sp.setValue('onboarding_done', true); } catch (e) {}
            dialog.close();
            if (thenStart) { try { this._startTimerFromMenu(); } catch (e) {} }
        };

        let build = () => {
            content.destroy_all_children();
            let head = new St.BoxLayout({ vertical: false, style: 'spacing: 4px; padding-bottom: 2px;' });
            head.add(new St.Label({ text: _("Smart setup"), style: 'font-size: 0.8em; padding-right: 6px;' }));
            for (let i = 0; i < TOTAL; i++) {
                let dot = new St.Label({ text: "\ud83c\udf45", style: 'font-size: 0.95em;' });
                dot.set_opacity(i <= st.step ? 255 : 70);
                head.add(dot);
            }
            content.add(head);

            let s = st.step;
            let buttons = [{ label: _("Skip"), action: finish }];

            if (s === 0) {
                content.add(title(_("What is the Pomodoro technique? \ud83c\udf45")));
                content.add(para(_("Focus in short sprints with deliberate rest: about 25 minutes on one task, then a 5-minute break; after four sprints, take a longer 15–30 minute break. The finite countdown keeps a task approachable and the regular breaks protect your attention.")));
                content.add(para(_("Let's tune it to how you work — five quick questions, and you can change anything later in Settings.")));
                buttons.push({ label: _("Let's go"), default: true, action: () => { st.step++; build(); } });
            } else if (s >= 1 && s <= QUESTIONS.length) {
                let q = QUESTIONS[s - 1];
                content.add(title(q.title));
                if (q.help) { content.add(para(q.help)); }
                content.add(ask(q.key, q.opts));
                buttons.push({ label: _("Back"), action: () => { st.step--; build(); } });
                buttons.push({ label: _("Next"), default: true, action: () => { st.step++; build(); } });
            } else {
                let plan = this._computeFocusPlan(answers);
                content.add(title(_("Your tailored setup \ud83c\udf45")));
                content.add(para(_("Based on your answers, here's what I'll set up. Apply it now, then tweak anything in Settings.")));
                let list = new St.BoxLayout({ vertical: true, style: 'spacing: 5px; padding: 6px 0 2px 0;' });
                plan.reasons.forEach((r) => {
                    let row = new St.BoxLayout({ vertical: false, style: 'spacing: 8px;' });
                    row.add(new St.Label({ text: "\u2713", style: 'color: #6fcf97; font-weight: bold;' }));
                    let t = new St.Label({ text: r });
                    t.clutter_text.line_wrap = true;
                    row.add(t);
                    list.add(row);
                });
                content.add(list);
                buttons.push({ label: _("Back"), action: () => { st.step--; build(); } });
                buttons.push({ label: _("Apply"), action: () => applyPlan(plan, false) });
                buttons.push({ label: "\ud83c\udf45  " + _("Apply & start"), default: true, action: () => applyPlan(plan, true) });
            }
            dialog.setButtons(buttons);
        };
        build();
        dialog.open();
        return dialog;
    };

    proto._dashFmtMin = function(min) {
        min = Math.max(0, Math.round(min || 0));
        if (min < 60) {
            return _("%d min").format(min);
        }
        let hrs = Math.floor(min / 60);
        let rem = min % 60;
        return rem ? _("%dh %dm").format(hrs, rem) : _("%dh").format(hrs);
    };

    proto._dashMilestoneTier = function(value, tiers) {
        let best = 0;
        for (let t of tiers) {
            if (value >= t) {
                best = t;
            }
        }
        return best;
    };

    proto._dashStatCard = function(caption, value, sub, accent) {
        let col = `rgb(${Math.round(accent[0] * 255)},${Math.round(accent[1] * 255)},${Math.round(accent[2] * 255)})`;
        let card = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style: 'spacing: 3px; padding: 12px; border-radius: 10px; background-color: rgba(128,128,128,0.16); min-width: 118px;'
        });
        card.add(new St.Label({ text: caption, style: 'font-size: 0.82em;' }));
        card.add(new St.Label({ text: value, style: 'font-size: 1.7em; font-weight: bold; color: ' + col + ';' }));
        card.add(new St.Label({ text: sub || "", style: 'font-size: 0.82em;' }));
        return card;
    };

    proto._paintDashBars = function(area) {
        let cr = area.get_context();
        try {
            let [w, h] = area.get_surface_size();
            let bars = this._dashBars || [];
            let n = bars.length || 14;
            let maxv = 1;
            for (let b of bars) {
                if (b.min > maxv) { maxv = b.min; }
            }
            let gap = 6;
            let bottomPad = 4;
            let bw = Math.max(2, (w - gap * (n - 1)) / n);
            let chartH = Math.max(4, h - bottomPad);
            let acc = this._dashAccent || [0.93, 0.42, 0.31];
            for (let i = 0; i < n; i++) {
                let b = bars[i] || { min: 0 };
                let x = Math.round(i * (bw + gap));
                cr.setSourceRGBA(0.5, 0.5, 0.5, 0.16);
                cr.rectangle(x, 0, Math.round(bw), chartH);
                cr.fill();
                let bh = Math.round((b.min / maxv) * (chartH - 2));
                if (bh > 0) {
                    cr.setSourceRGBA(acc[0], acc[1], acc[2], b.today ? 1.0 : 0.62);
                    cr.rectangle(x, chartH - bh, Math.round(bw), bh);
                    cr.fill();
                }
            }
        } finally {
            cr.$dispose();
        }
    };

    proto._paintDashHeatmap = function(area) {
        let cr = area.get_context();
        try {
            let [w, h] = area.get_surface_size();
            let data = this._dashHeatmap || [];
            let cols = 12;
            let rows = 7;
            let maxv = 1;
            for (let v of data) {
                if (v > maxv) { maxv = v; }
            }
            let gap = 3;
            let cw = Math.max(3, (w - gap * (cols - 1)) / cols);
            let ch = Math.max(3, (h - gap * (rows - 1)) / rows);
            let acc = this._dashAccent || [0.93, 0.42, 0.31];
            for (let col = 0; col < cols; col++) {
                for (let row = 0; row < rows; row++) {
                    let idx = col * rows + row;
                    let v = (idx < data.length) ? data[idx] : 0;
                    let x = Math.round(col * (cw + gap));
                    let y = Math.round(row * (ch + gap));
                    if (v > 0) {
                        cr.setSourceRGBA(acc[0], acc[1], acc[2], 0.2 + 0.8 * (v / maxv));
                    } else {
                        cr.setSourceRGBA(0.5, 0.5, 0.5, 0.16);
                    }
                    cr.rectangle(x, y, Math.round(cw), Math.round(ch));
                    cr.fill();
                }
            }
        } finally {
            cr.$dispose();
        }
    };

    proto._paintDashLegend = function(area) {
        let cr = area.get_context();
        try {
            let [w, h] = area.get_surface_size();
            let acc = this._dashAccent || [0.93, 0.42, 0.31];
            let n = 5;
            let gap = 3;
            let cw = Math.max(3, (w - gap * (n - 1)) / n);
            for (let i = 0; i < n; i++) {
                let x = Math.round(i * (cw + gap));
                if (i === 0) {
                    cr.setSourceRGBA(0.5, 0.5, 0.5, 0.16);
                } else {
                    cr.setSourceRGBA(acc[0], acc[1], acc[2], 0.2 + 0.8 * (i / (n - 1)));
                }
                cr.rectangle(x, 0, Math.round(cw), h);
                cr.fill();
            }
        } finally {
            cr.$dispose();
        }
    };

    proto._paintMiniBar = function(area, frac) {
        let cr = area.get_context();
        try {
            let [w, h] = area.get_surface_size();
            let acc = this._dashAccent || [0.93, 0.42, 0.31];
            let y = Math.round(h * 0.2);
            let bh = Math.max(3, Math.round(h * 0.6));
            cr.setSourceRGBA(0.5, 0.5, 0.5, 0.18);
            cr.rectangle(0, y, w, bh);
            cr.fill();
            let fw = Math.max(0, Math.min(1, frac)) * w;
            cr.setSourceRGBA(acc[0], acc[1], acc[2], 0.9);
            cr.rectangle(0, y, fw, bh);
            cr.fill();
        } finally {
            cr.$dispose();
        }
    };

    // Clear all tracked focus statistics (today, streak, history, totals,
    // heatmap). Useful to start fresh or wipe test data. Guarded by a
    // two-step confirmation in the dashboard.
    proto._resetStatistics = function() {
        this._dailyStatsData = {
            date: "", count: 0, streak: 0, lastGoalMetDate: "",
            history: {}, total: 0, totalMinutes: 0, totalInterruptions: 0,
            hours: new Array(24).fill(0)
        };
        try {
            this._writeJsonAsync(POMODORO_STATS_FILE, this._dailyStatsData);
        } catch (e) {
            global.logError("Zen Pomodoro: reset statistics failed: " + e);
        }
        this._dailyCount = 0;
        this._dailyStreak = 0;
        if (typeof this._updateMenuRuntime === "function") {
            this._updateMenuRuntime();
        }
        Main.notify(_("Statistics reset."));
    };

    proto._peakFocusHour = function(hours) {
        if (!Array.isArray(hours)) { return null; }
        let total = hours.reduce((a, b) => a + (b || 0), 0);
        if (total < 8) { return null; }
        let bestStart = 0, bestSum = -1;
        for (let hh = 0; hh < 24; hh++) {
            let s = (hours[hh] || 0) + (hours[(hh + 1) % 24] || 0);
            if (s > bestSum) { bestSum = s; bestStart = hh; }
        }
        let fmt = (x) => (x < 10 ? "0" : "") + x + ":00";
        return { hour: bestStart, label: fmt(bestStart) + "\u2013" + fmt((bestStart + 2) % 24) };
    };

    proto._statsInsight = function(st) {
        let goal = this._opt_dailyGoal || 0;
        if (goal > 0) {
            let left = goal - (st.today || 0);
            if (left > 0) {
                let est = this._estimateFinish();
                if (est) { return _("%d to go today — at your pace, done by about %s.").format(left, est.time); }
                return _("%d more to reach today's goal of %d.").format(left, goal);
            }
            return _("Daily goal reached — %d done today. Nice.").format(st.today || 0);
        }
        if ((st.interruptionsWeek || 0) >= 5) {
            return _("%d interruptions this week — what keeps pulling you away?").format(st.interruptionsWeek);
        }
        let peak = this._peakFocusHour(st.hours);
        if (peak) { return _("Most focused around %s — good time for deep work.").format(peak.label); }
        let tasks = this._taskList().slice().sort((a, b) => (b.done || 0) - (a.done || 0));
        if (tasks.length && (tasks[0].done || 0) > 0) {
            return _("Most focus went to \u201c%s\u201d.").format(tasks[0].title);
        }
        if ((st.week || 0) > 0) { return _("%d pomodoros this week. Keep it going.").format(st.week); }
        return _("Start a focus session — your insights will appear here.");
    };

    proto._paintHours = function(area) {
        let cr = area.get_context();
        try {
            let [w, h] = area.get_surface_size();
            let data = this._dashHours || new Array(24).fill(0);
            let maxv = 1;
            for (let v of data) { if (v > maxv) { maxv = v; } }
            let n = 24, gap = 2;
            let bw = Math.max(1, (w - gap * (n - 1)) / n);
            let acc = this._dashAccent || [0.93, 0.42, 0.31];
            let peak = this._dashPeakHour;
            for (let i = 0; i < n; i++) {
                let x = Math.round(i * (bw + gap));
                cr.setSourceRGBA(0.5, 0.5, 0.5, 0.16);
                cr.rectangle(x, 0, Math.round(bw), h);
                cr.fill();
                let bh = Math.round((data[i] / maxv) * (h - 2));
                if (bh > 0) {
                    let isPeak = (peak !== null && (i === peak || i === (peak + 1) % 24));
                    cr.setSourceRGBA(acc[0], acc[1], acc[2], isPeak ? 1.0 : 0.5);
                    cr.rectangle(x, h - bh, Math.round(bw), bh);
                    cr.fill();
                }
            }
        } finally {
            cr.$dispose();
        }
    };

    proto._dashDateLabel = function(d) {
        let dd = d.getDate(), mm = d.getMonth() + 1;
        return (dd < 10 ? "0" : "") + dd + "." + (mm < 10 ? "0" : "") + mm;
    };

    proto._showStatsDashboard = function() {
        let st = this._computeStats();
        let accent = [0.93, 0.42, 0.31];
        let green = [0.36, 0.78, 0.55];
        this._dashAccent = accent;

        let h = (this._dailyStatsData && this._dailyStatsData.history) ? this._dailyStatsData.history : {};
        let cellOf = (d) => h[d] || { c: 0, m: 0 };
        let bars = [];
        for (let i = 13; i >= 0; i--) {
            let bd = new Date(Date.now() - i * 86400000);
            let cell = cellOf(this._todayStr(bd));
            bars.push({ min: cell.m, count: cell.c, today: (i === 0), dateLabel: this._dashDateLabel(bd) });
        }
        this._dashBars = bars;
        let hmMeta = [];
        let now0 = new Date(); now0.setHours(0, 0, 0, 0);
        let dow0 = now0.getDay();
        let dowShort = [_("Sun"), _("Mon"), _("Tue"), _("Wed"), _("Thu"), _("Fri"), _("Sat")];
        for (let col = 0; col < 12; col++) {
            for (let row = 0; row < 7; row++) {
                let daysBack = (11 - col) * 7 + (dow0 - row);
                let m = { value: 0, future: daysBack < 0, label: "" };
                if (daysBack >= 0) {
                    let dd = new Date(now0.getTime() - daysBack * 86400000);
                    let ds = this._todayStr(dd);
                    m.value = (h[ds] && h[ds].c) || 0;
                    m.label = dowShort[dd.getDay()] + " " + this._dashDateLabel(dd);
                }
                hmMeta[col * 7 + row] = m;
            }
        }
        this._dashHeatmapMeta = hmMeta;
        this._dashHeatmap = hmMeta.map((m) => m.value);
        this._dashHours = st.hours || new Array(24).fill(0);
        let peak = this._peakFocusHour(st.hours);
        this._dashPeakHour = peak ? peak.hour : null;

        let dialog = new ModalDialog.ModalDialog({ destroyOnClose: true });
        let root = new St.BoxLayout({ vertical: true, style: 'spacing: 9px; width: 680px; padding: 8px 16px;' });

        // Floating hover tooltip shared by all charts (sits above the dialog).
        let dashTip = new St.Label({ visible: false, style: 'background-color: rgba(20,20,20,0.96); color: #fff; padding: 4px 9px; border-radius: 6px; font-size: 0.86em;' });
        Main.uiGroup.add_child(dashTip);
        let wireHover = (area, infoFn) => {
            area.reactive = true;
            area.connect('motion-event', (a, ev) => {
                let [ex, ey] = ev.get_coords();
                let [ax, ay] = a.get_transformed_position();
                let text = infoFn(ex - ax, ey - ay, a.width, a.height);
                if (text) {
                    dashTip.set_text(text);
                    dashTip.show();
                    dashTip.set_position(Math.round(ex) + 14, Math.round(ey) + 10);
                } else {
                    dashTip.hide();
                }
                return false;
            });
            area.connect('leave-event', () => { dashTip.hide(); return false; });
        };

        root.add(new St.Label({ text: _("Focus statistics"), style: 'font-size: 1.4em; font-weight: bold;' }));

        let insight = new St.Label({ text: this._statsInsight(st), style: 'font-size: 1.05em; padding: 8px 12px; border-radius: 8px; background-color: rgba(227,90,60,0.16);' });
        insight.clutter_text.line_wrap = true;
        root.add(insight);

        // Today / week cards (full width).
        let cards = new St.BoxLayout({ vertical: false, style: 'spacing: 10px;' });
        let trend = "";
        if ((st.lastWeek || 0) > 0) {
            let p = Math.round(((st.week || 0) - st.lastWeek) / st.lastWeek * 100);
            trend = (p > 0 ? "\u25b2 " : (p < 0 ? "\u25bc " : "")) + Math.abs(p) + "%";
        }
        let goal = this._opt_dailyGoal || 0;
        let todaySub = (goal > 0) ? _("%d / %d goal").format(st.today || 0, goal) : this._dashFmtMin(st.todayMin || 0);
        cards.add(this._dashStatCard(_("Today"), (st.today || 0) + " \ud83c\udf45", todaySub, accent));
        cards.add(this._dashStatCard(_("This week"), (st.week || 0) + " \ud83c\udf45", this._dashFmtMin(st.weekMin || 0) + (trend ? ("   " + trend) : ""), accent));
        cards.add(this._dashStatCard(_("Streak"), (st.streak || 0) + " \ud83d\udd25", _("best %d").format(st.longestStreak || 0), green));
        cards.add(this._dashStatCard(_("All time"), (st.total || 0) + " \ud83c\udf45", this._dashFmtMin(st.totalMinutes || 0), accent));
        root.add(cards);

        if ((st.total || 0) > 0) {
            let dowSum = [0, 0, 0, 0, 0, 0, 0];
            for (let k in h) { dowSum[new Date(k + "T00:00:00").getDay()] += (h[k].c || 0); }
            let bestDow = 0;
            for (let i = 1; i < 7; i++) { if (dowSum[i] > dowSum[bestDow]) { bestDow = i; } }
            let dowNames = [_("Sun"), _("Mon"), _("Tue"), _("Wed"), _("Thu"), _("Fri"), _("Sat")];
            let review = new St.Label({ text: _("This week: %d \ud83c\udf45 \u00b7 %s \u00b7 best day %s").format(st.week || 0, this._dashFmtMin(st.weekMin || 0), dowNames[bestDow]) });
            review.clutter_text.line_wrap = true;
            root.add(review);
        }

        let harvestN = Math.min(st.today || 0, 20);
        let harvestStr = harvestN > 0 ? "\ud83c\udf45".repeat(harvestN) : _("Nothing harvested yet today");
        if ((st.today || 0) > 20) { harvestStr += "  +" + ((st.today || 0) - 20); }
        let harvestLabel = new St.Label({ text: _("Today's harvest") + ":  " + harvestStr });
        harvestLabel.clutter_text.line_wrap = true;
        root.add(harvestLabel);

        let estF = this._estimateFinish();
        let infoParts = [];
        if (estF) { infoParts.push(_("\u2248 finish %s \u00b7 %d \ud83c\udf45 left").format(estF.time, estF.remaining)); }
        infoParts.push(_("Interruptions: %d today \u00b7 %d this week").format(st.interruptionsToday || 0, st.interruptionsWeek || 0));
        let infoLabel = new St.Label({ text: infoParts.join("      ") });
        infoLabel.clutter_text.line_wrap = true;
        root.add(infoLabel);

        // The hourly histogram reads best full-width across the dialog.
        root.add(new St.Label({ text: _("When you focus (by hour)"), style: 'font-weight: bold; padding-top: 2px;' }));
        let hoursArea = new St.DrawingArea({ x_expand: true, style: 'height: 70px;' });
        hoursArea.connect('repaint', (a) => this._paintHours(a));
        wireHover(hoursArea, (x, y, w, hh) => {
            let i = Math.floor(x / (w / 24));
            if (i < 0 || i > 23) { return null; }
            return ((i < 10 ? "0" : "") + i) + ":00 · " + (this._dashHours[i] || 0) + " \ud83c\udf45";
        });
        root.add(hoursArea);
        let axis = new St.BoxLayout({ vertical: false });
        [_("night"), _("morning"), _("afternoon"), _("evening")].forEach((t) => {
            axis.add(new St.Label({ text: t, x_expand: true, style: 'font-size: 0.7em; opacity: 0.65;' }));
        });
        root.add(axis);
        root.add(new St.Label({
            text: peak ? _("Most focused around %s — good time for deep work.").format(peak.label)
                       : _("Not enough data yet to spot your best focus time."),
            style: 'font-size: 0.85em;'
        }));

        // Two balanced charts side by side keep the dialog compact.
        let cols = new St.BoxLayout({ vertical: false, style: 'spacing: 18px; padding-top: 8px;' });
        let colA = new St.BoxLayout({ vertical: true, x_expand: true, style: 'spacing: 5px;' });
        let colB = new St.BoxLayout({ vertical: true, x_expand: true, style: 'spacing: 5px;' });

        colA.add(new St.Label({ text: _("Focus time \u2014 last 14 days"), style: 'font-weight: bold;' }));
        let barArea = new St.DrawingArea({ x_expand: true, style: 'height: 92px;' });
        barArea.connect('repaint', (a) => this._paintDashBars(a));
        wireHover(barArea, (x, y, w, hh) => {
            let i = Math.floor(x / (w / 14));
            let b = (this._dashBars || [])[i];
            if (!b) { return null; }
            return b.dateLabel + " · " + (b.count || 0) + " \ud83c\udf45 · " + this._dashFmtMin(b.min || 0);
        });
        colA.add(barArea);
        let barAxis = new St.BoxLayout({ vertical: false });
        barAxis.add(new St.Label({ text: bars[0].dateLabel, style: 'font-size: 0.7em; opacity: 0.6;' }));
        barAxis.add(new St.Label({ text: bars[6].dateLabel, x_expand: true, x_align: Clutter.ActorAlign.CENTER, style: 'font-size: 0.7em; opacity: 0.6;' }));
        barAxis.add(new St.Label({ text: bars[13].dateLabel, style: 'font-size: 0.7em; opacity: 0.6;' }));
        colA.add(barAxis);

        colB.add(new St.Label({ text: _("Activity \u2014 last 12 weeks"), style: 'font-weight: bold;' }));
        let heatArea = new St.DrawingArea({ x_expand: true, style: 'height: 74px;' });
        heatArea.connect('repaint', (a) => this._paintDashHeatmap(a));
        wireHover(heatArea, (x, y, w, hh) => {
            let col = Math.floor(x / (w / 12)), row = Math.floor(y / (hh / 7));
            if (col < 0 || col > 11 || row < 0 || row > 6) { return null; }
            let m = (this._dashHeatmapMeta || [])[col * 7 + row];
            if (!m || m.future || !m.label) { return null; }
            return m.label + " · " + (m.value || 0) + " \ud83c\udf45";
        });
        let dayCol = new St.BoxLayout({ vertical: true, style: 'width: 26px;' });
        for (let drow = 0; drow < 7; drow++) {
            let dtxt = (drow === 1 || drow === 3 || drow === 5) ? dowShort[drow] : "";
            dayCol.add(new St.Label({ text: dtxt, y_expand: true, style: 'font-size: 0.62em; opacity: 0.6;' }));
        }
        let heatRow = new St.BoxLayout({ vertical: false });
        heatRow.add(dayCol);
        heatRow.add(heatArea);
        colB.add(heatRow);
        let legend = new St.BoxLayout({ vertical: false, style: 'spacing: 6px;' });
        legend.add(new St.Label({ text: _("Less"), style: 'font-size: 0.8em;' }));
        let legendCells = new St.DrawingArea({ style: 'width: 80px; height: 13px;' });
        legendCells.connect('repaint', (a) => this._paintDashLegend(a));
        legend.add(legendCells);
        legend.add(new St.Label({ text: _("More"), style: 'font-size: 0.8em;' }));
        colB.add(legend);

        cols.add(colA);
        cols.add(colB);
        root.add(cols);

        // By task spans the full width so an empty list never leaves a side gap.
        let tasksByDone = this._taskList().slice()
            .sort((a, b) => (b.done || 0) - (a.done || 0))
            .filter((t) => (t.done || 0) > 0)
            .slice(0, 5);
        if (tasksByDone.length) {
            root.add(new St.Label({ text: _("By task"), style: 'font-weight: bold; padding-top: 10px;' }));
            let maxDone = tasksByDone[0].done || 1;
            for (let t of tasksByDone) {
                let frac = (t.done || 0) / maxDone;
                let title = (t.title.length > 28) ? (t.title.slice(0, 27) + "\u2026") : t.title;
                let rowB = new St.BoxLayout({ vertical: false, style: 'spacing: 8px;' });
                rowB.add(new St.Label({ text: title, style: 'width: 240px;' }));
                let mb = new St.DrawingArea({ x_expand: true, style: 'height: 13px;' });
                mb.connect('repaint', (a) => this._paintMiniBar(a, frac));
                let tTitle = t.title, tDone = (t.done || 0);
                wireHover(mb, () => tTitle + " · " + tDone + " \ud83c\udf45");
                rowB.add(mb);
                rowB.add(new St.Label({ text: (t.done || 0) + " \ud83c\udf45", style: 'width: 48px;' }));
                root.add(rowB);
            }
        }

        let tot = this._dashMilestoneTier(st.total || 0, [10, 25, 50, 100, 250, 500, 1000, 2000]);
        let stk = this._dashMilestoneTier(st.longestStreak || 0, [3, 7, 14, 30, 60, 100, 365]);
        let badges = [];
        if (tot > 0) { badges.push("\ud83c\udfc6 " + tot); }
        if (stk > 0) { badges.push("\ud83d\udd25 " + stk); }
        if (badges.length) {
            root.add(new St.Label({ text: _("Milestones: %s").format(badges.join("    ")), style: 'padding-top: 4px;' }));
        }

        dialog.contentLayout.add(root);
        let setDashButtons, confirmReset;
        confirmReset = () => {
            dialog.setButtons([
                { label: _("Cancel"), action: () => setDashButtons() },
                { label: _("Delete all statistics"), action: () => { this._resetStatistics(); dialog.close(); } }
            ]);
        };
        setDashButtons = () => {
            dialog.setButtons([
                { label: _("Reset statistics\u2026"), action: () => confirmReset() },
                { label: _("Close"), key: Clutter.KEY_Escape, default: true, action: () => dialog.close() }
            ]);
        };
        setDashButtons();
        dialog.connect('closed', () => { try { dashTip.destroy(); } catch (e) {} });
        dialog.open();
        return dialog;
    };

    proto._clearIdleWatches = function() {
        if (this._idleMonitor) {
            if (this._idleWatchId) {
                try { this._idleMonitor.remove_watch(this._idleWatchId); } catch (e) {}
            }
            if (this._activeWatchId) {
                try { this._idleMonitor.remove_watch(this._activeWatchId); } catch (e) {}
            }
        }
        this._idleWatchId = 0;
        this._activeWatchId = 0;
    };

    proto._updateIdleWatch = function() {
        this._clearIdleWatches();

        if (!this._opt_autoPauseIdle || this._currentState !== 'pomodoro') {
            return;
        }

        try {
            if (!this._idleMonitor) {
                this._idleMonitor = Meta.IdleMonitor.get_core();
            }
        } catch (e) {
            this._idleMonitor = null;
        }
        if (!this._idleMonitor) {
            return;
        }

        let minutes = this._opt_autoPauseIdleMinutes || 5;
        this._idleWatchId = this._idleMonitor.add_idle_watch(minutes * 60 * 1000, () => {
            if (this._currentState !== 'pomodoro') {
                return;
            }
            this._pauseTimerFromMenu();
            if (this._opt_autoResumeOnActivity && this._idleMonitor) {
                this._activeWatchId = this._idleMonitor.add_user_active_watch(() => {
                    this._activeWatchId = 0;
                    if (this._isPausedState()) {
                        this._startTimerFromMenu();
                    }
                });
            }
        });
    };

    // Ambient is on when a sound (not "off") is chosen.
    proto._ambientEnabled = function() {
        let c = this._opt_focusAmbientChoice;
        return !!c && c !== 'off';
    };

    // Chosen sound changed: remember a real choice (for the menu toggle), then
    // switch or stop the loop live.
    proto._onAmbientChoiceChanged = function() {
        if (this._ambientEnabled()) { this._ambientLastChoice = this._opt_focusAmbientChoice; }
        this._updateAmbientSound();
        if (typeof this._updateMenuRuntime === 'function') { this._updateMenuRuntime(); }
    };

    proto._updateAmbientSound = function() {
        if (this._ambientEnabled() && this._currentState === 'pomodoro') {
            this._startAmbientSound();
        } else {
            this._stopAmbientSound();
        }
    };

    // Resolve the ambient sound path from the chosen built-in noise, or the
    // user's own file when "Custom file" is selected.
    proto._ambientPath = function() {
        let map = { white: 'white.ogg', pink: 'pink.ogg', brown: 'brown.ogg', rain: 'rain.ogg', sea: 'sea.ogg' };
        let choice = this._opt_focusAmbientChoice || 'off';
        let f;
        if (choice === 'custom') {
            f = (this._opt_focusAmbientFile || "").trim() || 'brown.ogg';
        } else {
            f = map[choice] || 'brown.ogg';
        }
        return SoundModule.addPathIfRelative(f, this._defaultSoundPath);
    };

    proto._ensureAmbientSound = function() {
        let path = this._ambientPath();
        if (!this._ambientSound || this._ambientSoundPath !== path) {
            if (this._ambientSound) { this._ambientSound.stop(); }
            this._ambientSound = new SoundModule.SoundEffect(path);
            this._ambientSoundPath = path;
        }
        return this._ambientSound;
    };

    proto._startAmbientSound = function() {
        if (!SoundModule || typeof SoundModule.isPlayable !== 'function' || !SoundModule.isPlayable()) {
            return;
        }
        let snd = this._ensureAmbientSound();
        if (snd.isPlaying()) {
            return;
        }
        let vol = Math.max(0, Math.min(1, (this._opt_focusAmbientVolume || 40) / 100));
        snd.play({ loop: true, volume: vol });
    };

    proto._stopAmbientSound = function() {
        if (this._ambientVolTimeout) {
            Mainloop.source_remove(this._ambientVolTimeout);
            this._ambientVolTimeout = 0;
        }
        if (this._ambientSound) {
            this._ambientSound.stop();
        }
    };

    // Short preview of the chosen ambient sound from settings. Uses a separate
    // player (preview auto-stops after a couple of seconds) so it never disturbs
    // a loop that may be running during focus.
    proto._previewAmbientSound = function() {
        if (!SoundModule || typeof SoundModule.isPlayable !== 'function' || !SoundModule.isPlayable()) {
            Main.notify(_("No sound backend available for preview."));
            return;
        }
        if (!this._ambientEnabled()) {
            Main.notify(_("Choose an ambient sound first (it's set to Off)."));
            return;
        }
        if (this._ambientPreview) { this._ambientPreview.stop(); }
        this._ambientPreview = new SoundModule.SoundEffect(this._ambientPath());
        let vol = Math.max(0, Math.min(1, (this._opt_focusAmbientVolume || 40) / 100));
        this._ambientPreview.play({ volume: vol, preview: true });
    };

    // Live volume: replay the ambient loop at the new level while focusing.
    // Debounced so dragging the slider doesn't stutter the audio.
    // Live update while focusing: apply a new volume or a newly chosen sound by
    // replaying the loop. Debounced so dragging the slider doesn't stutter.
    proto._restartAmbientLive = function() {
        if (this._ambientVolTimeout) {
            Mainloop.source_remove(this._ambientVolTimeout);
        }
        this._ambientVolTimeout = Mainloop.timeout_add(220, () => {
            this._ambientVolTimeout = 0;
            try {
                if (this._ambientEnabled() && this._currentState === 'pomodoro' &&
                    this._ambientSound && this._ambientSound.isPlaying()) {
                    let snd = this._ensureAmbientSound();
                    let vol = Math.max(0, Math.min(1, (this._opt_focusAmbientVolume || 40) / 100));
                    snd.play({ loop: true, volume: vol });
                }
            } catch (e) {}
            return false;
        });
    };

    // Do Not Disturb: mute Cinnamon notifications while focusing, restoring the
    // previous value afterwards. Uses the native gsettings schema; opt-in.
    proto._getNotificationSettings = function() {
        if (this._notificationSettings !== null) {
            return this._notificationSettings;
        }
        this._notificationSettings = false; // sentinel: tried, unavailable
        try {
            let src = Gio.SettingsSchemaSource.get_default();
            if (src && src.lookup('org.cinnamon.desktop.notifications', true)) {
                this._notificationSettings = new Gio.Settings({ schema_id: 'org.cinnamon.desktop.notifications' });
            }
        } catch (e) {
            this._notificationSettings = false;
        }
        return this._notificationSettings;
    };

    proto._updateDnd = function() {
        if (this._opt_focusDnd && this._currentState === 'pomodoro') {
            this._enableDnd();
        } else {
            this._disableDnd();
        }
    };

    proto._enableDnd = function() {
        if (this._dndActive) {
            return;
        }
        let s = this._getNotificationSettings();
        if (!s) {
            return;
        }
        try {
            this._dndPrevValue = s.get_boolean('display-notifications');
            s.set_boolean('display-notifications', false);
            this._dndActive = true;
        } catch (e) {
            this._dndActive = false;
        }
    };

    proto._disableDnd = function() {
        if (!this._dndActive) {
            return;
        }
        this._dndActive = false;
        let s = this._getNotificationSettings();
        if (!s) {
            return;
        }
        try {
            s.set_boolean('display-notifications', this._dndPrevValue !== false);
        } catch (e) {
            // ignore
        }
    };

    // Pause external media players (browser tab, music app) during breaks and
    // pauses, then resume only the ones we paused when focus continues. Uses
    // the standard MPRIS D-Bus interface, so there is no external dependency.
    proto._mediaShouldBePaused = function() {
        if (!this._opt_pauseMedia) {
            return false;
        }
        let s = this._currentState;
        return (s === 'short-break' || s === 'long-break' ||
                s === 'pomodoro-paused' || s === 'short-break-paused' ||
                s === 'long-break-paused');
    };

    proto._updateMediaPause = function() {
        if (this._mediaShouldBePaused()) {
            this._pausePlayingMedia();
        } else {
            this._resumePausedMedia();
        }
    };

    proto._mprisPlayerCall = function(busName, method) {
        try {
            Gio.DBus.session.call(
                busName, '/org/mpris/MediaPlayer2',
                'org.mpris.MediaPlayer2.Player', method, null, null,
                Gio.DBusCallFlags.NONE, 1500, null,
                (conn, res) => { try { conn.call_finish(res); } catch (e) {} });
        } catch (e) {}
    };

    proto._pausePlayingMedia = function() {
        if (this._mediaPauseInFlight) {
            return;
        }
        this._mediaPauseInFlight = true;
        try {
            Gio.DBus.session.call(
                'org.freedesktop.DBus', '/org/freedesktop/DBus',
                'org.freedesktop.DBus', 'ListNames', null,
                GLib.VariantType.new('(as)'), Gio.DBusCallFlags.NONE, 1500, null,
                (conn, res) => {
                    this._mediaPauseInFlight = false;
                    let names;
                    try { names = conn.call_finish(res).get_child_value(0).deep_unpack(); }
                    catch (e) { return; }
                    for (let name of names) {
                        if (typeof name === 'string' && name.indexOf('org.mpris.MediaPlayer2.') === 0) {
                            this._pauseIfPlaying(name);
                        }
                    }
                });
        } catch (e) {
            this._mediaPauseInFlight = false;
        }
    };

    proto._pauseIfPlaying = function(busName) {
        try {
            Gio.DBus.session.call(
                busName, '/org/mpris/MediaPlayer2',
                'org.freedesktop.DBus.Properties', 'Get',
                GLib.Variant.new('(ss)', ['org.mpris.MediaPlayer2.Player', 'PlaybackStatus']),
                GLib.VariantType.new('(v)'), Gio.DBusCallFlags.NONE, 1500, null,
                (conn, res) => {
                    let status = '';
                    try { status = conn.call_finish(res).get_child_value(0).get_variant().get_string()[0]; }
                    catch (e) { return; }
                    // Re-check state: a short break may have ended before this returned.
                    if (status === 'Playing' && this._mediaShouldBePaused()) {
                        if (this._pausedMediaPlayers.indexOf(busName) === -1) {
                            this._pausedMediaPlayers.push(busName);
                        }
                        this._mprisPlayerCall(busName, 'Pause');
                    }
                });
        } catch (e) {}
    };

    proto._resumePausedMedia = function() {
        if (!this._pausedMediaPlayers || this._pausedMediaPlayers.length === 0) {
            return;
        }
        let players = this._pausedMediaPlayers.slice();
        this._pausedMediaPlayers = [];
        for (let name of players) {
            this._mprisPlayerCall(name, 'Play');
        }
    };

    // Run a user-configured command (argv, no shell) when focus or a break
    // starts. Opt-in and empty by default.
    proto._runEventCommand = function(which) {
        if (!this._opt_runCommandEnabled) {
            return;
        }
        let cmd;
        if (which === 'focus') { cmd = this._opt_focusStartCommand; }
        else if (which === 'goal') { cmd = this._opt_goalCommand; }
        else { cmd = this._opt_breakStartCommand; }
        if (!cmd || !cmd.trim()) {
            return;
        }
        cmd = cmd.trim();
        if (cmd.startsWith('file://')) {
            cmd = decodeURIComponent(cmd.substr(7));
        }
        let argv;
        if (GLib.file_test(cmd, GLib.FileTest.EXISTS)) {
            // A chosen script file — run it directly (handles spaces in the path).
            if (!GLib.file_test(cmd, GLib.FileTest.IS_EXECUTABLE)) {
                global.logError("Zen Pomodoro: chosen file is not executable: " + cmd);
                return;
            }
            // Pass context so one script can react: $1 = event, $2 = current task.
            argv = [cmd, which, this._currentFocusTask || ""];
        } else {
            // Fall back to treating the value as an inline command.
            try {
                let [ok, parsed] = GLib.shell_parse_argv(cmd);
                if (!ok || !parsed || parsed.length === 0) {
                    return;
                }
                argv = parsed;
            } catch (e) {
                global.logError("Zen Pomodoro: cannot parse command '" + cmd + "': " + e.message);
                return;
            }
        }
        try {
            let proc = Gio.Subprocess.new(argv,
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);
            proc.wait_async(null, (p, res) => {
                try {
                    p.wait_finish(res);
                } catch (e) {
                    // ignore
                }
            });
        } catch (e) {
            global.logError("Zen Pomodoro: failed to run command: " + e.message);
        }
    };

    // Optional push notification (Pushover) on key events, opt-in. Uses the
    // user's own credentials and posts only to the official Pushover API.
    proto._sendPushover = function(message, sound, priority) {
        if (!this._opt_pushoverEnabled || !Soup) {
            return;
        }
        let user = (this._opt_pushoverUserKey || '').trim();
        let token = (this._opt_pushoverAppToken || '').trim();
        if (!user || !token) {
            return;
        }
        message = (message || '').trim();
        if (!message) {
            return;
        }
        let title = (this._opt_pushoverTitle || '').trim() || 'Zen Pomodoro';
        let task = (this._currentFocusTask && this._currentFocusTask.trim()) ? this._currentFocusTask.trim() : _("No task");
        let mins = "";
        let curTimer = this._timerQueue ? this._timerQueue.getCurrentTimer() : null;
        if (curTimer) {
            mins = String(Math.max(0, Math.ceil(curTimer.getTicksRemaining() / 60)));
        }
        message = message.replace(/\{task\}/g, task).replace(/\{minutes\}/g, mins);
        try {
            if (!this._pushoverSession) {
                this._pushoverSession = new Soup.Session();
            }
            let msg = Soup.Message.new('POST', 'https://api.pushover.net/1/messages.json');
            let body = 'token=' + encodeURIComponent(token) +
                '&user=' + encodeURIComponent(user) +
                '&title=' + encodeURIComponent(title) +
                '&message=' + encodeURIComponent(message) +
                '&html=1' +
                '&priority=' + encodeURIComponent(priority || '0') +
                '&sound=' + encodeURIComponent(sound || 'pushover');
            msg.set_request_body_from_bytes('application/x-www-form-urlencoded',
                new GLib.Bytes(ByteArray.fromString(body)));
            this._pushoverSession.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (s, res) => {
                try {
                    s.send_and_read_finish(res);
                } catch (e) {
                    global.logError("Zen Pomodoro: Pushover request failed: " + e.message);
                }
            });
        } catch (e) {
            global.logError("Zen Pomodoro: Pushover error: " + e.message);
        }
    };

    // Settings "Send a test notification" button. Unlike _sendPushover this
    // gives explicit feedback so the user can confirm their keys are correct.
    proto._pushoverTest = function() {
        if (!Soup) {
            Main.notify(_("Push notifications need libsoup, which isn't available here."));
            return;
        }
        let user = (this._opt_pushoverUserKey || '').trim();
        let token = (this._opt_pushoverAppToken || '').trim();
        if (!user || !token) {
            Main.notify(_("Enter your Pushover user key and app token first."));
            return;
        }
        let title = (this._opt_pushoverTitle || '').trim() || 'Zen Pomodoro';
        let body = 'token=' + encodeURIComponent(token) +
            '&user=' + encodeURIComponent(user) +
            '&title=' + encodeURIComponent(title) +
            '&message=' + encodeURIComponent(_("Test notification from Zen Pomodoro \ud83c\udf45")) +
            '&priority=0';
        try {
            if (!this._pushoverSession) {
                this._pushoverSession = new Soup.Session();
            }
            let msg = Soup.Message.new('POST', 'https://api.pushover.net/1/messages.json');
            msg.set_request_body_from_bytes('application/x-www-form-urlencoded',
                new GLib.Bytes(ByteArray.fromString(body)));
            this._pushoverSession.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (s, res) => {
                let ok = false;
                try {
                    let bytes = s.send_and_read_finish(res);
                    let status = (typeof msg.get_status === 'function') ? msg.get_status() : 0;
                    let txt = '';
                    try { txt = ByteArray.toString(bytes.get_data()); } catch (e) { txt = ''; }
                    ok = (status === 200) && /"status"\s*:\s*1/.test(txt);
                } catch (e) {
                    global.logError("Zen Pomodoro: Pushover test failed: " + e.message);
                    ok = false;
                }
                Main.notify(ok
                    ? _("Pushover test sent \u2713 — check your device.")
                    : _("Pushover test failed. Double-check your user key and app token."));
            });
        } catch (e) {
            global.logError("Zen Pomodoro: Pushover test error: " + e.message);
            Main.notify(_("Pushover test failed. Double-check your user key and app token."));
        }
    };

    // Opt-in convenience: open /etc/hosts in the system's admin-capable editor
    // via the GVfs admin backend (interactive polkit prompt). This does NOT block
    // anything automatically; the user edits the file themselves.
    proto._collectBlockDomains = function() {
        let domains = [];
        let list = this._opt_blockDomains || [];
        for (let row of list) {
            let d = (row && row.domain ? String(row.domain) : '').trim().toLowerCase();
            if (!d) { continue; }
            // Accept pasted URLs: reduce to a bare hostname (e.g.
            // "https://ya.ru/path" -> "ya.ru"). The helper validates again.
            d = d.replace(/^[a-z][a-z0-9+.\-]*:\/\//, '');
            d = d.split('/')[0].split('?')[0];
            if (d.indexOf('@') >= 0) { d = d.split('@').pop(); }
            d = d.split(':')[0];
            d = d.replace(/^www\./, '');
            if (d) { domains.push(d); }
        }
        return domains;
    };

    // Path of the root-owned helper that "Set up passwordless blocking" installs
    // (with a polkit policy so pkexec runs it without a prompt). Used for
    // automatic blocking during focus.
    proto._passwordlessHelperPath = function() {
        return POMODORO_HOSTS_HELPER_INSTALLED;
    };

    // Bundled (user-dir) helper + setup script, run via interactive pkexec.
    proto._bundledHelperPath = function() {
        let base = (this._metadata && this._metadata.path) ? this._metadata.path : '';
        return base + '/hosts-helper.py';
    };
    proto._setupScriptPath = function() {
        let base = (this._metadata && this._metadata.path) ? this._metadata.path : '';
        return base + '/setup-passwordless.py';
    };

    // Snapshot of the blocking state, for UI and decisions:
    //  - passwordlessInstalled: root helper + polkit policy both present
    //  - sectionActive: our marked section currently exists in /etc/hosts
    //  - hostsDomains/hostsCount: domains that section blocks right now
    //  - listCount: domains configured in settings
    // /etc/hosts is world-readable, so this needs no privilege.
    proto._blockingStatus = function() {
        let passwordless = GLib.file_test(POMODORO_HOSTS_HELPER_INSTALLED, GLib.FileTest.IS_REGULAR)
            && GLib.file_test(POMODORO_HOSTS_POLICY_INSTALLED, GLib.FileTest.IS_REGULAR);
        let sectionActive = false;
        let hostsDomains = [];
        try {
            let [ok, contents] = GLib.file_get_contents(POMODORO_HOSTS_FILE);
            if (ok) {
                let text = ByteArray.toString(contents);
                let inSection = false;
                for (let line of text.split("\n")) {
                    let s = line.trim();
                    if (s === POMODORO_HOSTS_BLOCK_BEGIN) { inSection = true; sectionActive = true; continue; }
                    if (s === POMODORO_HOSTS_BLOCK_END) { inSection = false; continue; }
                    if (inSection) {
                        let m = /^0\.0\.0\.0\s+(\S+)/.exec(s);
                        if (m && m[1].indexOf("www.") !== 0) { hostsDomains.push(m[1]); }
                    }
                }
            }
        } catch (e) {
            global.logError("Zen Pomodoro: cannot read hosts for status: " + e.message);
        }
        return {
            passwordlessInstalled: passwordless,
            sectionActive: sectionActive,
            hostsCount: hostsDomains.length,
            hostsDomains: hostsDomains,
            listCount: this._collectBlockDomains().length
        };
    };

    // The helper to run a block/unblock with: the installed passwordless one
    // (no prompt) if present, otherwise the bundled one (interactive pkexec).
    proto._blockHelperBinary = function() {
        return this._blockingStatus().passwordlessInstalled
            ? this._passwordlessHelperPath() : this._bundledHelperPath();
    };

    // Manually (re)apply the current block list to /etc/hosts now. Removing a
    // site from the list and pressing Apply rewrites the section without it.
    proto._applyBlockNow = function() {
        let domains = this._collectBlockDomains();
        if (!domains.length) { this._clearBlockNow(); return; }
        this._runHostsHelper(['pkexec', this._blockHelperBinary(), 'block'].concat(domains),
            _("Blocking updated — %d site(s).").format(domains.length),
            () => { if (typeof this._updateMenuRuntime === 'function') { this._updateMenuRuntime(); } });
    };

    // Remove our section from /etc/hosts now (unblock everything we added).
    proto._clearBlockNow = function() {
        this._runHostsHelper(['pkexec', this._blockHelperBinary(), 'unblock'],
            _("Site blocking cleared."),
            () => { if (typeof this._updateMenuRuntime === 'function') { this._updateMenuRuntime(); } });
    };

    // The toggle (and the domain list) drive blocking directly: on => block now,
    // off => unblock now. Skip until init has settled so we never prompt at login.
    proto._onBlockDomainsChanged = function() {
        if (typeof this._updateMenuRuntime === 'function') { this._updateMenuRuntime(); }
        if (!this._blockingReady) { return; }
        this._syncBlocking(true);
    };

    // Bring /etc/hosts to the desired state: blocked with exactly the listed
    // domains when the toggle is on, otherwise unblocked. Idempotent — only runs
    // the helper when the live state differs, so it won't re-prompt needlessly.
    // interactive=false suppresses the password prompt (startup/background): it
    // then only reconciles when passwordless blocking is set up.
    proto._syncBlocking = function(interactive) {
        let domains = this._opt_enableBlocking ? this._collectBlockDomains() : [];
        let want = domains.length > 0;
        let st = this._blockingStatus();
        if (want) {
            let cur = st.hostsDomains.slice().sort().join(",");
            let desired = domains.slice().sort().join(",");
            if (st.sectionActive && cur === desired) { return; }
        } else if (!st.sectionActive) {
            return;
        }
        if (!st.passwordlessInstalled && !interactive) { return; }
        if (want) { this._applyBlockNow(); } else { this._clearBlockNow(); }
    };

    // Drop a stale block section left by a crash/reload when we are not actively
    // focusing — but only when passwordless is installed, so we never trigger a
    // password prompt at startup/exit. Without passwordless the user clears it
    // once from settings.
    proto._reconcileStaleBlock = function() {
        // Variant 1: blocking persists while the toggle is on, so there is no
        // "stale" block to clear on remove. Reconciliation runs via _syncBlocking.
    };

    // Cached blocking status for the menu row. /etc/hosts is read only while the
    // menu is open (the row is only visible then) and cached, so we don't read it
    // on every tick.
    proto._menuBlockStatus = function() {
        if (this._appletMenu && this._appletMenu.isOpen) {
            this._blockStatusCache = this._blockingStatus();
        }
        return this._blockStatusCache || {
            passwordlessInstalled: false, sectionActive: false,
            hostsCount: 0, hostsDomains: [], listCount: this._getBlockedSitesCount()
        };
    };

    // Block/unblock via a bundled helper run with pkexec (interactive admin
    // prompt). The helper only manages its own marked section of /etc/hosts.
    proto._runHostsHelper = function(argv, okMessage, onDone) {
        try {
            let proc = Gio.Subprocess.new(argv,
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);
            proc.wait_async(null, (p, res) => {
                let ok = false;
                try {
                    p.wait_finish(res);
                    ok = (p.get_exit_status() === 0);
                } catch (e) {
                    global.logError("Zen Pomodoro: hosts update failed: " + e.message);
                    return;
                }
                if (ok && okMessage) {
                    Main.notify(okMessage);
                }
                if (typeof onDone === 'function') { try { onDone(ok); } catch (e) {} }
                // non-zero (e.g. the user dismissed the password prompt): stay silent
            });
        } catch (e) {
            global.logError("Zen Pomodoro: could not run pkexec: " + e.message);
        }
    };

    proto._setupPasswordlessBlocking = function() {
        this._runHostsHelper(['pkexec', this._setupScriptPath(), 'install', 'yes', this._bundledHelperPath()],
            _("Passwordless blocking enabled (no prompt)."));
    };

    proto._removePasswordlessBlocking = function() {
        this._runHostsHelper(['pkexec', this._setupScriptPath(), 'uninstall'], _("Passwordless blocking removed."));
    };

    proto._toggleZenMode = function(forceState) {
        this._zenActive = (typeof forceState === "boolean") ? forceState : !this._zenActive;
        this._updateZenOverlay();
        // Keep the menu switch in sync (e.g. after the overlay is dismissed too).
        this._updateMenuRuntime();
        if (this._zenActive) {
            this._maybeShowZenIntro();
        }
    };

    // First time Zen is switched on, explain what it does — and, crucially, why
    // nothing seems to happen when it's armed outside a focus session.
    proto._maybeShowZenIntro = function() {
        let shown = false;
        try { shown = this._settingsProvider.getValue("zen_intro_shown"); } catch (e) {}
        if (shown) { return; }
        try { this._settingsProvider.setValue("zen_intro_shown", true); } catch (e) {}
        let isFocus = (this._currentState === 'pomodoro' || this._currentState === 'pomodoro-paused');
        let body = isFocus
            ? _("Focus spotlight is on — every other window is dimmed so the one you're working in stands out. Click the on-screen pill (or switch Zen off) to exit.")
            : _("Focus spotlight is armed. When your next focus session starts, every window except the one you're working in dims, so your task stands out. Click the on-screen pill to exit.");
        try { Main.notify(_("Zen mode"), body); } catch (e) {}
    };

    proto._updateZenOverlay = function() {
        let isFocus = (this._currentState === 'pomodoro' || this._currentState === 'pomodoro-paused');
        let show = this._zenActive && this._opt_zenModeEnabled && isFocus;
        if (!show) {
            this._teardownZenSpotlight();
            return;
        }
        this._ensureZenHud();
        if (!this._zenFocusSignal) {
            this._zenFocusSignal = global.display.connect('notify::focus-window', () => {
                this._applyZenDim();
                this._positionZenHud();
            });
        }
        this._applyZenDim();
        this._zenHud.show();
        if (typeof this._zenHud.raise_top === 'function') { this._zenHud.raise_top(); }
        this._refreshZenLabels();
    };

    // Focus spotlight: darken every other window so the one you're working in
    // stays bright. Keyed by a named effect we can always strip back off.
    proto._applyZenDim = function() {
        let focus = global.display.get_focus_window ? global.display.get_focus_window() : null;
        let actors = global.get_window_actors ? global.get_window_actors() : [];
        for (let i = 0; i < actors.length; i++) {
            let a = actors[i];
            let mw = a.meta_window || (a.get_meta_window && a.get_meta_window());
            let dimThis = false;
            if (mw && mw !== focus) {
                dimThis = true;
                // Leave panels/docks/desktop alone — only recede real windows.
                try { if (mw.is_skip_taskbar && mw.is_skip_taskbar()) { dimThis = false; } } catch (e) {}
            }
            try {
                if (dimThis) {
                    if (!a.get_effect("zen-spotlight")) {
                        let fx = new Clutter.BrightnessContrastEffect();
                        fx.set_brightness(-0.5);
                        a.add_effect_with_name("zen-spotlight", fx);
                    }
                } else {
                    a.remove_effect_by_name("zen-spotlight");
                }
            } catch (e) {}
        }
    };

    // Always strip the dim from every window — used on exit/break/disable so the
    // screen can never get stuck dark.
    proto._clearZenDim = function() {
        let actors = global.get_window_actors ? global.get_window_actors() : [];
        for (let i = 0; i < actors.length; i++) {
            try { actors[i].remove_effect_by_name("zen-spotlight"); } catch (e) {}
        }
    };

    proto._teardownZenSpotlight = function() {
        if (this._zenFocusSignal) {
            try { global.display.disconnect(this._zenFocusSignal); } catch (e) {}
            this._zenFocusSignal = 0;
        }
        this._clearZenDim();
        if (this._zenHud) {
            try { this._zenHud.hide(); } catch (e) {}
        }
    };

    proto._ensureZenHud = function() {
        if (this._zenHud) { return; }
        this._zenHud = new St.BoxLayout({
            reactive: true,
            track_hover: true,
            style: "background-color: rgba(8,8,8,0.82); border-radius: 14px; padding: 6px 16px; spacing: 12px;"
        });
        this._zenTimeLabel = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
            style: "color: rgba(255,255,255,0.96); font-size: 1.25em; font-weight: bold;"
        });
        let exit = new St.Label({
            text: "\u2715  " + _("Exit focus"),
            y_align: Clutter.ActorAlign.CENTER,
            style: "color: rgba(235,175,75,0.95);"
        });
        this._zenHud.add_actor(this._zenTimeLabel);
        this._zenHud.add_actor(exit);
        this._zenHud.connect('button-press-event', () => {
            this._zenActive = false;
            this._updateZenOverlay();
            this._updateMenuRuntime();
            return Clutter.EVENT_STOP;
        });
        Main.uiGroup.add_actor(this._zenHud);
    };

    proto._positionZenHud = function() {
        if (!this._zenHud) { return; }
        let mon = Main.layoutManager ? Main.layoutManager.primaryMonitor : null;
        if (!mon) { return; }
        let natW = 200;
        try { natW = this._zenHud.get_preferred_width(-1)[1] || 200; } catch (e) {}
        this._zenHud.set_position(mon.x + Math.round((mon.width - natW) / 2), mon.y + 12);
    };

    proto._refreshZenLabels = function() {
        if (!this._zenHud || !this._zenHud.visible) {
            return;
        }
        let timer = this._timerQueue ? this._timerQueue.getCurrentTimer() : null;
        let ticks = timer ? timer.getTicksRemaining() : 0;
        if (this._zenTimeLabel) {
            this._zenTimeLabel.set_text(this._getFormattedTimeLeft(ticks) || "--:--");
        }
        this._positionZenHud();
    };

    proto._updateBreathingGuide = function() {
        if (this._opt_breakBreathing && (this._currentState === 'short-break' || this._currentState === 'long-break')) {
            this._startBreathing();
        } else {
            this._stopBreathing();
        }
    };

    proto._startBreathing = function() {
        if (this._breathSourceId) {
            return;
        }
        if (!this._breathOverlay) {
            this._breathOverlay = new St.BoxLayout({
                vertical: true,
                reactive: false,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                style: "spacing: 22px;"
            });
            this._breathCircleBin = new St.Bin({ x_align: St.Align.MIDDLE, x_expand: true });
            this._breathCircle = new St.Widget({
                width: 120,
                height: 120,
                style: "background-color: rgba(108, 224, 148, 0.22); border: 2px solid rgba(108, 224, 148, 0.7); border-radius: 200px;"
            });
            this._breathCircleBin.add_actor(this._breathCircle);
            this._breathPhaseLabel = new St.Label({ style: "color: rgba(200, 220, 210, 0.9); font-size: 1.3em;" });
            let plabel = new St.Bin({ x_align: St.Align.MIDDLE, x_expand: true });
            plabel.add_actor(this._breathPhaseLabel);
            this._breathOverlay.add_actor(this._breathCircleBin);
            this._breathOverlay.add_actor(plabel);
            Main.uiGroup.add_actor(this._breathOverlay);
        }

        let primary = Main.layoutManager ? Main.layoutManager.primaryMonitor : null;
        if (primary) {
            this._breathOverlay.set_position(primary.x, primary.y + Math.round(primary.height * 0.32));
            this._breathOverlay.set_size(primary.width, Math.round(primary.height * 0.36));
        }
        this._breathOverlay.show();
        if (typeof this._breathOverlay.raise_top === 'function') {
            this._breathOverlay.raise_top();
        }
        this._breathStartMs = GLib.get_monotonic_time() / 1000;
        this._tickBreathing();
        this._breathSourceId = Mainloop.timeout_add(60, () => {
            this._tickBreathing();
            return true;
        });
    };

    proto._tickBreathing = function() {
        if (!this._breathCircle) {
            return;
        }
        // Phase durations [in, hold, out, hold] in seconds.
        let pat = this._opt_breathingPattern || 'box';
        let phases = (pat === '478') ? [4, 7, 8, 0]
            : (pat === 'relax') ? [4, 0, 6, 0]
            : [4, 4, 4, 4];
        let cycle = (phases[0] + phases[1] + phases[2] + phases[3]) * 1000;
        if (cycle <= 0) {
            cycle = 16000;
        }
        let reduce = Boolean(this._opt_reduceMotion);
        let t = ((GLib.get_monotonic_time() / 1000) - this._breathStartMs) % cycle;
        let minR = 90, maxR = 240, r, phase;
        let inEnd = phases[0] * 1000;
        let hold1End = inEnd + phases[1] * 1000;
        let outEnd = hold1End + phases[2] * 1000;
        if (t < inEnd) {
            r = reduce ? maxR : (minR + (maxR - minR) * (t / (phases[0] * 1000)));
            phase = _("Breathe in");
        } else if (t < hold1End) {
            r = maxR;
            phase = _("Hold");
        } else if (t < outEnd) {
            r = reduce ? minR : (maxR - (maxR - minR) * ((t - hold1End) / (phases[2] * 1000)));
            phase = _("Breathe out");
        } else {
            r = minR;
            phase = _("Hold");
        }
        r = Math.round(r);
        this._breathCircle.set_size(r, r);
        if (this._breathPhaseLabel) {
            this._breathPhaseLabel.set_text(phase);
        }
    };

    proto._stopBreathing = function() {
        if (this._breathSourceId) {
            Mainloop.source_remove(this._breathSourceId);
            this._breathSourceId = 0;
        }
        if (this._breathOverlay) {
            this._breathOverlay.hide();
        }
    };

    proto._focusUntilFromMenu = function() {
        if (this._timerQueue.isRunning() || this._isPausedState()) {
            Main.notify(_("Stop the timer before changing Pomodoro preset"));
            return;
        }

        let dialog = new ModalDialog.ModalDialog({ destroyOnClose: true });
        let content = new Dialog.MessageDialogContent({
            title: _("Focus until"),
            description: _("Enter a time (HH:MM)")
        });
        let entry = new St.Entry({ style_class: 'run-dialog-entry', can_focus: true });
        CinnamonEntry.addContextMenu(entry);
        content.add_child(entry);
        dialog.contentLayout.add(content);
        dialog.setInitialKeyFocus(entry.clutter_text);

        let confirm = () => {
            let txt = entry.clutter_text.get_text().trim();
            dialog.close();
            let m = txt.match(/^(\d{1,2}):(\d{2})$/);
            if (!m) {
                return;
            }
            let h = parseInt(m[1], 10), min = parseInt(m[2], 10);
            if (h > 23 || min > 59) {
                return;
            }
            let now = new Date();
            let target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min, 0, 0);
            if (target.getTime() <= now.getTime()) {
                target = new Date(target.getTime() + 86400000);
            }
            let secs = Math.round((target.getTime() - now.getTime()) / 1000);
            if (secs < 60) {
                return;
            }
            this._startFocusForDuration(secs);
        };

        entry.clutter_text.connect('key-press-event', (_actor, event) => {
            let symbol = event.get_key_symbol();
            if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter) {
                confirm();
                return true;
            }
            return false;
        });

        dialog.setButtons([
            { label: _("Cancel"), key: Clutter.KEY_Escape, action: () => dialog.close() },
            { label: _("Start"), default: true, action: confirm },
        ]);
        dialog.open();
    };

    proto._extendFocusFromDialog = function() {
        // At this point the queue points at the short break that follows the
        // just-finished pomodoro; step back to that pomodoro and run it again
        // for the configured extension, so the user stays in flow.
        let minutes = this._opt_flowExtendMinutes || 5;
        let pos = (typeof this._timerQueue.getPosition === "function") ? this._timerQueue.getPosition() : 0;
        let targetPos = Math.max(0, pos - 1);
        if (!this._timerQueue.setPosition(targetPos)) {
            return;
        }
        let timer = this._timerQueue.getCurrentTimer();
        if (timer !== this._timers.pomodoro) {
            return;
        }
        timer.setRemaining(minutes * 60);
        this._timerQueue.preventStart(false);
        this._appletMenu.toggleTimerState(true);
        this._timerQueue.start();
    };
}
