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
    POMODORO_FOCUS_START_SCRIPT,
    POMODORO_FOCUS_STOP_SCRIPT,
    POMODORO_CONFIG_FILE,
    POMODORO_FOCUS_TASKS_FILE,
    POMODORO_DOMAINS_FILE,
    POMODORO_STATE_FILE,
    POMODORO_STATE_MAX_AGE_MS,
    POMODORO_STATS_FILE,
    POMODORO_TASKS_DATA_FILE,
    POMODORO_HOSTS_HELPER_INSTALLED,
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
            this._sendPushover(this._opt_pushoverMsgGoal);
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
        return { tasks: [], currentId: "", date: this._todayStr(), templates: [] };
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
                        completed: Boolean(t.completed)
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

    proto._addTask = function(title, est) {
        title = (title || "").toString().trim();
        if (!title) { return; }
        if (!this._tasksData) { this._tasksData = this._defaultTasksData(); }
        let task = {
            id: this._newTaskId(),
            title: title.slice(0, 120),
            est: Math.max(1, Math.min(99, parseInt(est) || 1)),
            done: 0, doneToday: 0, completed: false
        };
        this._tasksData.tasks.push(task);
        if (!this._tasksData.currentId) {
            this._tasksData.currentId = task.id;
            this._setCurrentFocusTask(task.title);
        }
        this._saveTasks();
        this._refreshTasksMenu();
    };

    proto._setCurrentTaskId = function(id) {
        if (!this._tasksData) { return; }
        this._tasksData.currentId = id || "";
        let t = this._currentTask();
        if (t) { this._setCurrentFocusTask(t.title); }
        this._saveTasks();
        this._refreshTasksMenu();
    };

    proto._toggleTaskCompleted = function(id) {
        let t = this._taskList().find((x) => x.id === id);
        if (!t) { return; }
        t.completed = !t.completed;
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

    proto._incrementCurrentTaskProgress = function() {
        let t = this._currentTask();
        if (!t) { return; }
        t.done = (t.done || 0) + 1;
        t.doneToday = (t.doneToday || 0) + 1;
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
        let remaining = 0;
        for (let t of this._taskList()) {
            if (t.completed) { continue; }
            let left = (t.est || 0) - (t.doneToday || 0);
            if (left > 0) { remaining += left; }
        }
        if (remaining <= 0) { return null; }
        let work = this._opt_pomodoroTimeMinutes || 25;
        let brk = this._opt_shortBreakTimeMinutes || 5;
        let mins = remaining * work + Math.max(0, remaining - 1) * brk;
        let end = new Date(Date.now() + mins * 60000);
        let hh = end.getHours().toString().padStart(2, '0');
        let mm = end.getMinutes().toString().padStart(2, '0');
        return { remaining: remaining, mins: mins, time: `${hh}:${mm}` };
    };

    proto._showAddTaskDialog = function() {
        let dialog = new ModalDialog.ModalDialog({ destroyOnClose: true });
        let content = new Dialog.MessageDialogContent({
            title: _("New task"),
            description: _("What do you want to work on?")
        });
        let entry = new St.Entry({ style_class: 'run-dialog-entry', can_focus: true });
        CinnamonEntry.addContextMenu(entry);
        content.add_child(entry);

        let est = { value: 1 };
        let estRow = new St.BoxLayout({ vertical: false, style: 'spacing: 6px; padding-top: 10px;' });
        estRow.add(new St.Label({ text: _("Estimate:") }));
        let estBtns = [];
        let restyle = () => {
            for (let k = 0; k < estBtns.length; k++) {
                estBtns[k].set_style('padding: 2px 8px;' + ((k + 1 === est.value) ? ' background-color: rgba(227,90,60,0.55); border-radius: 6px;' : ''));
            }
        };
        for (let i = 1; i <= 6; i++) {
            let b = new St.Button({ label: i + " \ud83c\udf45", style_class: 'button' });
            let val = i;
            b.connect('clicked', () => { est.value = val; restyle(); });
            estBtns.push(b);
            estRow.add(b);
        }
        restyle();
        content.add_child(estRow);

        dialog.contentLayout.add(content);
        dialog.setInitialKeyFocus(entry.clutter_text);
        let confirm = () => {
            let t = entry.clutter_text.get_text().trim();
            dialog.close();
            if (t) { this._addTask(t, est.value); }
        };
        entry.clutter_text.connect('key-press-event', (actor, ev) => {
            let s = ev.get_key_symbol();
            if (s === Clutter.KEY_Return || s === Clutter.KEY_KP_Enter) { confirm(); return true; }
            return false;
        });
        dialog.setButtons([
            { label: _("Cancel"), key: Clutter.KEY_Escape, action: () => dialog.close() },
            { label: _("Add"), default: true, action: confirm }
        ]);
        dialog.open();
    };

    proto._saveTaskTemplate = function(name) {
        name = (name || "").toString().trim();
        if (!name) { return; }
        let tasks = this._taskList().map((t) => ({ title: t.title, est: t.est || 1 }));
        if (!tasks.length) { Main.notify(_("No tasks to save")); return; }
        if (!this._tasksData) { this._tasksData = this._defaultTasksData(); }
        if (!Array.isArray(this._tasksData.templates)) { this._tasksData.templates = []; }
        this._tasksData.templates = this._tasksData.templates.filter((x) => x.name !== name);
        this._tasksData.templates.push({ name: name.slice(0, 80), tasks: tasks });
        this._saveTasks();
        this._refreshTasksMenu();
        Main.notify(_("Template saved: %s").format(name));
    };

    proto._applyTaskTemplate = function(name) {
        let tpl = (this._tasksData && Array.isArray(this._tasksData.templates))
            ? this._tasksData.templates.find((x) => x.name === name) : null;
        if (!tpl) { return; }
        if (!this._tasksData) { this._tasksData = this._defaultTasksData(); }
        for (let t of tpl.tasks) {
            let task = { id: this._newTaskId(), title: t.title, est: t.est || 1, done: 0, doneToday: 0, completed: false };
            this._tasksData.tasks.push(task);
            if (!this._tasksData.currentId) {
                this._tasksData.currentId = task.id;
                this._setCurrentFocusTask(task.title);
            }
        }
        this._saveTasks();
        this._refreshTasksMenu();
    };

    proto._showSaveTemplateDialog = function() {
        if (!this._taskList().length) { Main.notify(_("No tasks to save")); return; }
        let dialog = new ModalDialog.ModalDialog({ destroyOnClose: true });
        let content = new Dialog.MessageDialogContent({
            title: _("Save as template"),
            description: _("Template name")
        });
        let entry = new St.Entry({ style_class: 'run-dialog-entry', can_focus: true });
        CinnamonEntry.addContextMenu(entry);
        content.add_child(entry);
        dialog.contentLayout.add(content);
        dialog.setInitialKeyFocus(entry.clutter_text);
        let confirm = () => {
            let n = entry.clutter_text.get_text().trim();
            dialog.close();
            if (n) { this._saveTaskTemplate(n); }
        };
        entry.clutter_text.connect('key-press-event', (actor, ev) => {
            let s = ev.get_key_symbol();
            if (s === Clutter.KEY_Return || s === Clutter.KEY_KP_Enter) { confirm(); return true; }
            return false;
        });
        dialog.setButtons([
            { label: _("Cancel"), key: Clutter.KEY_Escape, action: () => dialog.close() },
            { label: _("Save"), default: true, action: confirm }
        ]);
        dialog.open();
    };

    proto._showOnboardingWizard = function() {
        let dialog = new ModalDialog.ModalDialog({ destroyOnClose: true });
        let TOTAL = 7;
        let st = { step: 0 };
        let sp = this._settingsProvider;
        let content = new St.BoxLayout({ vertical: true, style: 'spacing: 10px; width: 520px; padding: 6px 14px;' });
        dialog.contentLayout.add(content);

        let title = (s) => new St.Label({ text: s, style: 'font-size: 1.35em; font-weight: bold;' });
        let para = (s) => { let l = new St.Label({ text: s }); l.clutter_text.line_wrap = true; return l; };
        let hint = (s) => new St.Label({ text: s, style: 'font-size: 0.82em; padding-top: 4px;' });
        let PILL = 'background-color: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.32); border-radius: 14px; padding: 7px 16px; margin: 6px 8px 0 0;';
        let PILL_ON = 'background-color: rgba(227,90,60,0.7); border: 1px solid rgba(227,90,60,1.0); border-radius: 14px; padding: 7px 16px; margin: 6px 8px 0 0; color: #ffffff;';
        let rowOf = (arr) => { let r = new St.BoxLayout({ vertical: false }); arr.forEach((x) => r.add(x)); return r; };
        let choice = (defs) => {
            let r = new St.BoxLayout({ vertical: false });
            let btns = [];
            defs.forEach((d) => {
                let b = new St.Button({ label: d.label });
                b.set_style(d.active ? PILL_ON : PILL);
                b.connect('clicked', () => { try { d.fn(); } catch (e) {} btns.forEach((x) => x.set_style(PILL)); b.set_style(PILL_ON); });
                btns.push(b);
                r.add(b);
            });
            return r;
        };
        let toggle = (label, initial, setter) => {
            let on = { v: !!initial };
            let b = new St.Button();
            let refresh = () => { b.set_label((on.v ? "\u2713  " : "") + label); b.set_style(on.v ? PILL_ON : PILL); };
            b.connect('clicked', () => { on.v = !on.v; try { setter(on.v); } catch (e) {} refresh(); });
            refresh();
            return b;
        };
        let actionChip = (label, fn) => {
            let b = new St.Button({ label: label });
            b.set_style(PILL);
            b.connect('clicked', () => { try { fn(b); } catch (e) {} });
            return b;
        };

        let finish = () => { try { sp.setValue('onboarding_done', true); } catch (e) {} dialog.close(); };

        let build = () => {
            content.destroy_all_children();
            let head = new St.BoxLayout({ vertical: false, style: 'spacing: 4px; padding-bottom: 2px;' });
            head.add(new St.Label({ text: _("Quick start"), style: 'font-size: 0.8em; padding-right: 6px;' }));
            for (let i = 0; i < TOTAL; i++) {
                let dot = new St.Label({ text: "\ud83c\udf45", style: 'font-size: 0.95em;' });
                dot.set_opacity(i <= st.step ? 255 : 70);
                head.add(dot);
            }
            content.add(head);
            let s = st.step;
            if (s === 0) {
                content.add(title(_("Welcome to Zen Pomodoro \ud83c\udf45")));
                content.add(para(_("Work in calm focus intervals with gentle on-screen cues instead of alarms. Let's set it up in a few quick steps — you can change everything later in Settings.")));
            } else if (s === 1) {
                content.add(title(_("Your rhythm")));
                content.add(para(_("Pick a focus / short break / long break length. The classic Pomodoro is 25 / 5 / 15 minutes.")));
                content.add(hint(_("Tap to choose:")));
                content.add(choice([
                    { label: _("25 / 5 / 15"), active: (this._opt_pomodoroTimeMinutes === 25), fn: () => { sp.setValue('pomodoro_duration', 25); sp.setValue('short_break_duration', 5); sp.setValue('long_break_duration', 15); sp.setValue('pomodori_number', 4); } },
                    { label: _("50 / 10 / 20"), active: (this._opt_pomodoroTimeMinutes === 50), fn: () => { sp.setValue('pomodoro_duration', 50); sp.setValue('short_break_duration', 10); sp.setValue('long_break_duration', 20); sp.setValue('pomodori_number', 4); } }
                ]));
            } else if (s === 2) {
                content.add(title(_("Daily goal")));
                content.add(para(_("How many pomodoros do you aim for each day? It powers your streak and the progress ring (you can turn it off).")));
                content.add(hint(_("Tap to choose:")));
                let g = this._opt_dailyGoal || 0;
                content.add(choice([
                    { label: _("Off"), active: g === 0, fn: () => sp.setValue('daily_goal', 0) },
                    { label: "4", active: g === 4, fn: () => sp.setValue('daily_goal', 4) },
                    { label: "6", active: g === 6, fn: () => sp.setValue('daily_goal', 6) },
                    { label: "8", active: g === 8, fn: () => sp.setValue('daily_goal', 8) }
                ]));
            } else if (s === 3) {
                content.add(title(_("Calm focus")));
                content.add(para(_("Recommended: mute notifications while focusing and play a soft periodic chime. Fine-tune all sounds later in Settings → Sounds.")));
                content.add(hint(_("Tap to toggle:")));
                content.add(rowOf([
                    toggle(_("Mute notifications"), this._opt_focusDnd, (v) => sp.setValue('focus_dnd', v)),
                    toggle(_("Soft chime"), this._opt_intervalChime, (v) => sp.setValue('interval_chime', v))
                ]));
            } else if (s === 4) {
                content.add(title(_("Block distractions")));
                content.add(para(_("Optionally block distracting sites during focus (edits /etc/hosts via an admin prompt). Add domains in Settings → Advanced — you can even set it up to ask for your password only once.")));
                content.add(hint(_("Tap to toggle:")));
                content.add(rowOf([ toggle(_("Block distracting sites"), false, (v) => sp.setValue('enable_blocking', v)) ]));
            } else if (s === 5) {
                content.add(title(_("Track tasks")));
                content.add(para(_("Add tasks with an estimate in pomodoros from the menu's Tasks submenu. Your current task links to the focus session, and the dashboard shows where your time goes.")));
                let entry = new St.Entry({ style_class: 'run-dialog-entry', can_focus: true, hint_text: _("Add your first task (optional)") });
                CinnamonEntry.addContextMenu(entry);
                content.add(entry);
                content.add(rowOf([ actionChip(_("Add task"), (b) => { let t = entry.clutter_text.get_text().trim(); if (t) { this._addTask(t, 1); entry.clutter_text.set_text(""); b.set_label("\u2713 " + _("Added")); } }) ]));
            } else {
                content.add(title(_("You're all set \ud83c\udf45")));
                content.add(para(_("Open the menu to start a focus, pick a task, or open Statistics → the dashboard. Set keyboard shortcuts in Settings → Panel. Enjoy calm, focused work!")));
                let startBtn = new St.Button({ label: "\ud83c\udf45  " + _("Start first focus") });
                startBtn.set_style(PILL_ON + ' font-weight: bold; padding: 9px 20px;');
                startBtn.connect('clicked', () => { finish(); this._startTimerFromMenu(); });
                content.add(rowOf([ startBtn ]));
            }
            let buttons = [{ label: _("Skip"), action: finish }];
            if (st.step > 0) { buttons.push({ label: _("Back"), action: () => { st.step--; build(); } }); }
            if (st.step < TOTAL - 1) { buttons.push({ label: _("Next"), default: true, action: () => { st.step++; build(); } }); }
            else { buttons.push({ label: _("Done"), default: true, action: finish }); }
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
            style: 'spacing: 3px; padding: 12px; border-radius: 10px; background-color: rgba(255,255,255,0.06); min-width: 118px;'
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
                cr.setSourceRGBA(1, 1, 1, 0.06);
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
                        cr.setSourceRGBA(1, 1, 1, 0.06);
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
                    cr.setSourceRGBA(1, 1, 1, 0.06);
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
            cr.setSourceRGBA(1, 1, 1, 0.08);
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

    proto._exportStats = function() {
        let dir = null;
        try { dir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD); } catch (e) { dir = null; }
        if (!dir) { dir = GLib.get_home_dir(); }
        let now = new Date();
        let stamp = this._todayStr(now) + "-" +
            now.getHours().toString().padStart(2, '0') +
            now.getMinutes().toString().padStart(2, '0') +
            now.getSeconds().toString().padStart(2, '0');

        let h = (this._dailyStatsData && this._dailyStatsData.history) ? this._dailyStatsData.history : {};
        let rows = ["date,pomodoros,focus_minutes,interruptions"];
        for (let k of Object.keys(h).sort()) {
            let c = h[k] || {};
            rows.push(`${k},${c.c || 0},${c.m || 0},${c.i || 0}`);
        }
        let csv = rows.join("\n") + "\n";
        let csvPath = GLib.build_filenamev([dir, "zen-pomodoro-" + stamp + ".csv"]);
        let jsonObj = { exportedAt: now.toISOString(), stats: this._dailyStatsData || {}, tasks: this._tasksData || {} };
        let jsonPath = GLib.build_filenamev([dir, "zen-pomodoro-" + stamp + ".json"]);

        let ok = false;
        try { GLib.file_set_contents(csvPath, csv); ok = true; } catch (e) { global.logError("Zen Pomodoro export csv: " + e); }
        try { GLib.file_set_contents(jsonPath, JSON.stringify(jsonObj, null, 2)); ok = true; } catch (e) { global.logError("Zen Pomodoro export json: " + e); }
        if (ok) {
            try { Gio.AppInfo.launch_default_for_uri(GLib.filename_to_uri(dir, null), null); } catch (e) {}
            Main.notify(_("Statistics exported"), _("Saved CSV + JSON to %s (opened the folder).").format(dir));
        } else {
            Main.notify(_("Export failed"));
        }
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
                cr.setSourceRGBA(1, 1, 1, 0.06);
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

    proto._showStatsDashboard = function() {
        let st = this._computeStats();
        let accent = [0.93, 0.42, 0.31];
        let green = [0.36, 0.78, 0.55];
        this._dashAccent = accent;

        let h = (this._dailyStatsData && this._dailyStatsData.history) ? this._dailyStatsData.history : {};
        let cellOf = (d) => h[d] || { c: 0, m: 0 };
        let bars = [];
        for (let i = 13; i >= 0; i--) {
            let cell = cellOf(this._todayStr(new Date(Date.now() - i * 86400000)));
            bars.push({ min: cell.m, count: cell.c, today: (i === 0) });
        }
        this._dashBars = bars;
        this._dashHeatmap = st.heatmap || [];
        this._dashHours = st.hours || new Array(24).fill(0);
        let peak = this._peakFocusHour(st.hours);
        this._dashPeakHour = peak ? peak.hour : null;

        let dialog = new ModalDialog.ModalDialog({ destroyOnClose: true });
        let scroll = new St.ScrollView({ style: 'max-height: 600px;', hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC });
        let root = new St.BoxLayout({ vertical: true, style: 'spacing: 9px; width: 544px; padding: 6px 10px;' });

        root.add(new St.Label({ text: _("Focus statistics"), style: 'font-size: 1.4em; font-weight: bold;' }));

        // Headline insight — the actionable "so what".
        let insight = new St.Label({ text: this._statsInsight(st), style: 'font-size: 1.05em; padding: 8px 10px; border-radius: 8px; background-color: rgba(227,90,60,0.16);' });
        insight.clutter_text.line_wrap = true;
        root.add(insight);

        // Today / week at a glance.
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

        // Weekly review in one line.
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
        if (estF) {
            root.add(new St.Label({ text: _("\u2248 finish %s \u00b7 %d \ud83c\udf45 left").format(estF.time, estF.remaining) }));
        }
        root.add(new St.Label({ text: _("Interruptions: %d today \u00b7 %d this week").format(st.interruptionsToday || 0, st.interruptionsWeek || 0) }));

        // When you focus best — the most actionable insight.
        root.add(new St.Label({ text: _("When you focus (by hour)"), style: 'font-weight: bold; padding-top: 6px;' }));
        let hoursArea = new St.DrawingArea({ x_expand: true, style: 'height: 60px;' });
        hoursArea.connect('repaint', (a) => this._paintHours(a));
        root.add(hoursArea);
        let axis = new St.BoxLayout({ vertical: false });
        [_("night"), _("morning"), _("afternoon"), _("evening")].forEach((t) => {
            axis.add(new St.Label({ text: t, x_expand: true, style: 'font-size: 0.72em; opacity: 0.65;' }));
        });
        root.add(axis);
        root.add(new St.Label({
            text: peak ? _("Most focused around %s — good time for deep work.").format(peak.label)
                       : _("Not enough data yet to spot your best focus time."),
            style: 'font-size: 0.9em;'
        }));

        root.add(new St.Label({ text: _("Focus time \u2014 last 14 days"), style: 'font-weight: bold; padding-top: 6px;' }));
        let barArea = new St.DrawingArea({ x_expand: true, style: 'height: 120px;' });
        barArea.connect('repaint', (a) => this._paintDashBars(a));
        root.add(barArea);

        let tasksByDone = this._taskList().slice()
            .sort((a, b) => (b.done || 0) - (a.done || 0))
            .filter((t) => (t.done || 0) > 0)
            .slice(0, 5);
        if (tasksByDone.length) {
            root.add(new St.Label({ text: _("By task"), style: 'font-weight: bold; padding-top: 6px;' }));
            let maxDone = tasksByDone[0].done || 1;
            for (let t of tasksByDone) {
                let frac = (t.done || 0) / maxDone;
                let title = (t.title.length > 26) ? (t.title.slice(0, 25) + "\u2026") : t.title;
                let rowB = new St.BoxLayout({ vertical: false, style: 'spacing: 8px;' });
                let nameL = new St.Label({ text: title, style: 'width: 180px;' });
                rowB.add(nameL);
                let mb = new St.DrawingArea({ x_expand: true, style: 'height: 14px;' });
                mb.connect('repaint', (a) => this._paintMiniBar(a, frac));
                rowB.add(mb);
                rowB.add(new St.Label({ text: (t.done || 0) + " \ud83c\udf45", style: 'width: 46px;' }));
                root.add(rowB);
            }
        }

        // Consistency + milestones (secondary).
        root.add(new St.Label({ text: _("Activity \u2014 last 12 weeks"), style: 'font-weight: bold; padding-top: 6px;' }));
        let heatArea = new St.DrawingArea({ x_expand: true, style: 'height: 78px;' });
        heatArea.connect('repaint', (a) => this._paintDashHeatmap(a));
        root.add(heatArea);
        let legend = new St.BoxLayout({ vertical: false, style: 'spacing: 6px;' });
        legend.add(new St.Label({ text: _("Less"), style: 'font-size: 0.8em;' }));
        let legendCells = new St.DrawingArea({ style: 'width: 90px; height: 14px;' });
        legendCells.connect('repaint', (a) => this._paintDashLegend(a));
        legend.add(legendCells);
        legend.add(new St.Label({ text: _("More"), style: 'font-size: 0.8em;' }));
        root.add(legend);

        let tot = this._dashMilestoneTier(st.total || 0, [10, 25, 50, 100, 250, 500, 1000, 2000]);
        let stk = this._dashMilestoneTier(st.longestStreak || 0, [3, 7, 14, 30, 60, 100, 365]);
        let badges = [];
        if (tot > 0) { badges.push("\ud83c\udfc6 " + tot); }
        if (stk > 0) { badges.push("\ud83d\udd25 " + stk); }
        if (badges.length) {
            root.add(new St.Label({ text: _("Milestones: %s").format(badges.join("    ")), style: 'padding-top: 4px;' }));
        }

        scroll.add_actor(root);
        dialog.contentLayout.add(scroll);
        dialog.setButtons([
            { label: _("Export CSV"), action: () => this._exportStats() },
            { label: _("Close"), key: Clutter.KEY_Escape, default: true, action: () => dialog.close() }
        ]);
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

    proto._updateAmbientSound = function() {
        if (this._opt_focusAmbientSound && this._currentState === 'pomodoro') {
            this._startAmbientSound();
        } else {
            this._stopAmbientSound();
        }
    };

    proto._startAmbientSound = function() {
        if (this._ambientSound && this._ambientSound.isPlaying()) {
            return;
        }
        if (!SoundModule || typeof SoundModule.isPlayable !== 'function' || !SoundModule.isPlayable()) {
            return;
        }
        if (!this._ambientSound) {
            let path = SoundModule.addPathIfRelative('brownnoise.ogg', this._defaultSoundPath);
            this._ambientSound = new SoundModule.SoundEffect(path);
        }
        let vol = Math.max(0, Math.min(1, (this._opt_focusAmbientVolume || 40) / 100));
        this._ambientSound.play({ loop: true, volume: vol });
    };

    proto._stopAmbientSound = function() {
        if (this._ambientSound) {
            this._ambientSound.stop();
        }
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

    // Run a user-configured command (argv, no shell) when focus or a break
    // starts. Opt-in and empty by default.
    proto._runEventCommand = function(which) {
        if (!this._opt_runCommandEnabled) {
            return;
        }
        let cmd = (which === 'focus') ? this._opt_focusStartCommand : this._opt_breakStartCommand;
        if (!cmd || !cmd.trim()) {
            return;
        }
        let argv;
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
    proto._sendPushover = function(message) {
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
                '&priority=' + encodeURIComponent(this._opt_pushoverPriority || '0') +
                '&sound=' + encodeURIComponent(this._opt_pushoverSound || 'pushover');
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

    // Opt-in convenience: open /etc/hosts in the system's admin-capable editor
    // via the GVfs admin backend (interactive polkit prompt). This does NOT block
    // anything automatically; the user edits the file themselves.
    proto._editHostsAsAdmin = function() {
        try {
            Gio.AppInfo.launch_default_for_uri('admin:///etc/hosts', null);
        } catch (e) {
            global.logError("Zen Pomodoro: could not open the hosts file: " + e.message);
            Main.notify(_("Could not open the hosts file"));
        }
    };

    proto._hostsHelperPath = function() {
        try {
            if (GLib.file_test(POMODORO_HOSTS_HELPER_INSTALLED, GLib.FileTest.EXISTS)) {
                return POMODORO_HOSTS_HELPER_INSTALLED;
            }
        } catch (e) {}
        let base = (this._metadata && this._metadata.path) ? this._metadata.path : '';
        return base + '/hosts-helper.py';
    };

    proto._collectBlockDomains = function() {
        let domains = [];
        let list = this._opt_blockDomains || [];
        for (let row of list) {
            let d = (row && row.domain ? String(row.domain) : '').trim();
            if (d) {
                domains.push(d);
            }
        }
        return domains;
    };

    // Block/unblock via a bundled helper run with pkexec (interactive admin
    // prompt). The helper only manages its own marked section of /etc/hosts.
    proto._runHostsHelper = function(argv, okMessage) {
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
                if (ok) {
                    Main.notify(okMessage);
                }
                // non-zero (e.g. the user dismissed the password prompt): stay silent
            });
        } catch (e) {
            global.logError("Zen Pomodoro: could not run pkexec: " + e.message);
        }
    };

    proto._blockDistractions = function() {
        let domains = this._collectBlockDomains();
        if (domains.length === 0) {
            Main.notify(_("Add some domains to block first."));
            return;
        }
        let argv = ['pkexec', this._hostsHelperPath(), 'block'].concat(domains);
        this._runHostsHelper(argv, _("Distractions blocked."));
    };

    proto._unblockDistractions = function() {
        let argv = ['pkexec', this._hostsHelperPath(), 'unblock'];
        this._runHostsHelper(argv, _("Distractions unblocked."));
    };

    proto._setupPasswordlessBlocking = function() {
        let base = (this._metadata && this._metadata.path) ? this._metadata.path : '';
        let setup = base + '/setup-passwordless.py';
        let src = base + '/hosts-helper.py';
        let mode = this._opt_blockPasswordlessFull ? 'yes' : 'keep';
        let ok = (mode === 'yes')
            ? _("Passwordless blocking enabled (no prompt).")
            : _("Passwordless blocking enabled (asks once per session).");
        this._runHostsHelper(['pkexec', setup, 'install', mode, src], ok);
    };

    proto._removePasswordlessBlocking = function() {
        let base = (this._metadata && this._metadata.path) ? this._metadata.path : '';
        let setup = base + '/setup-passwordless.py';
        this._runHostsHelper(['pkexec', setup, 'uninstall'], _("Passwordless blocking removed."));
    };

    proto._toggleZenMode = function() {
        this._zenActive = !this._zenActive;
        this._updateZenOverlay();
    };

    proto._updateZenOverlay = function() {
        let isFocus = (this._currentState === 'pomodoro' || this._currentState === 'pomodoro-paused');
        let show = this._zenActive && this._opt_zenModeEnabled && isFocus;
        if (!show) {
            if (this._zenOverlay) {
                this._zenOverlay.hide();
            }
            if (!isFocus) {
                this._zenActive = false;
            }
            return;
        }

        if (!this._zenOverlay) {
            this._zenOverlay = new St.BoxLayout({
                vertical: true,
                reactive: true,
                style: "background-color: rgba(8, 8, 8, 0.93);"
            });
            let box = new St.BoxLayout({
                vertical: true,
                x_expand: true,
                y_expand: true,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                style: "spacing: 16px;"
            });
            this._zenTaskLabel = new St.Label({ style: "color: rgba(235, 235, 235, 0.9); font-size: 1.5em;" });
            this._zenTimeLabel = new St.Label({ style: "color: rgba(255, 255, 255, 0.96); font-size: 6em; font-weight: bold;" });
            let hint = new St.Label({ text: _("Click to exit Zen"), style: "color: rgba(160, 160, 160, 0.65); padding-top: 10px;" });
            box.add_actor(this._zenTaskLabel);
            box.add_actor(this._zenTimeLabel);
            box.add_actor(hint);
            this._zenOverlay.add_actor(box);
            this._zenOverlay.connect('button-press-event', () => {
                this._zenActive = false;
                this._updateZenOverlay();
                return Clutter.EVENT_STOP;
            });
            Main.uiGroup.add_actor(this._zenOverlay);
        }

        let primary = Main.layoutManager ? Main.layoutManager.primaryMonitor : null;
        if (primary) {
            this._zenOverlay.set_position(primary.x, primary.y);
            this._zenOverlay.set_size(primary.width, primary.height);
        }
        this._refreshZenLabels();
        if (typeof this._zenOverlay.raise_top === 'function') {
            this._zenOverlay.raise_top();
        }
        this._zenOverlay.show();
    };

    proto._refreshZenLabels = function() {
        if (!this._zenOverlay || !this._zenOverlay.visible) {
            return;
        }
        let timer = this._timerQueue ? this._timerQueue.getCurrentTimer() : null;
        let ticks = timer ? timer.getTicksRemaining() : 0;
        if (this._zenTimeLabel) {
            this._zenTimeLabel.set_text(this._getFormattedTimeLeft(ticks) || "--:--");
        }
        if (this._zenTaskLabel) {
            this._zenTaskLabel.set_text(this._currentFocusTask ? this._currentFocusTask : _("Focus"));
        }
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
