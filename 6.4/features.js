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
            let data = { date: "", count: 0, streak: 0, lastGoalMetDate: "", history: {}, total: 0 };
            if (parsed && typeof parsed === "object") {
                data.date = parsed.date || "";
                data.count = parseInt(parsed.count) || 0;
                data.streak = parseInt(parsed.streak) || 0;
                data.lastGoalMetDate = parsed.lastGoalMetDate || "";
                if (parsed.history && typeof parsed.history === "object") {
                    for (let k in parsed.history) {
                        let v = parseInt(parsed.history[k]);
                        if (!isNaN(v) && v > 0) {
                            data.history[k] = v;
                        }
                    }
                }
                data.total = parseInt(parsed.total) || 0;
                // Migrate stats saved before per-day history existed.
                if (Object.keys(data.history).length === 0 && data.date && data.count > 0) {
                    data.history[data.date] = data.count;
                }
                if (!data.total) {
                    let sum = 0;
                    for (let k in data.history) {
                        sum += data.history[k];
                    }
                    data.total = sum;
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

    proto._recordPomodoroCompleted = function() {
        let today = this._todayStr();
        let yesterday = this._todayStr(new Date(Date.now() - 86400000));
        let s = this._dailyStatsData || { date: "", count: 0, streak: 0, lastGoalMetDate: "", history: {}, total: 0 };
        if (!s.history) {
            s.history = {};
        }
        if (typeof s.total !== "number") {
            s.total = 0;
        }
        if (s.date !== today) {
            s.date = today;
            s.count = 0;
        }
        s.count += 1;
        s.history[today] = (s.history[today] || 0) + 1;
        s.total += 1;
        // Keep the per-day history bounded (~18 weeks).
        let cutoff = this._todayStr(new Date(Date.now() - 126 * 86400000));
        for (let k in s.history) {
            if (k < cutoff) {
                delete s.history[k];
            }
        }
        let goal = this._opt_dailyGoal || 0;
        if (goal > 0 && s.count === goal) {
            if (s.lastGoalMetDate === yesterday) {
                s.streak = (s.streak || 0) + 1;
            } else if (s.lastGoalMetDate !== today) {
                s.streak = 1;
            }
            s.lastGoalMetDate = today;
        }
        this._dailyStatsData = s;
        this._writeJsonAsync(POMODORO_STATS_FILE, s);
        this._dailyCount = s.count;
        this._dailyStreak = s.streak || 0;
        this._updateMenuRuntime();
    };

    // Marinara-style breakdown: today / last 7 days / last 30 days / all-time + streak.
    proto._computeStats = function() {
        let h = (this._dailyStatsData && this._dailyStatsData.history) ? this._dailyStatsData.history : {};
        let today = this._todayStr();
        let week = 0;
        let month = 0;
        for (let i = 0; i < 30; i++) {
            let day = this._todayStr(new Date(Date.now() - i * 86400000));
            let c = h[day] || 0;
            month += c;
            if (i < 7) {
                week += c;
            }
        }
        let total = (this._dailyStatsData && typeof this._dailyStatsData.total === "number") ? this._dailyStatsData.total : 0;
        let last7 = [];
        for (let i = 6; i >= 0; i--) {
            last7.push(h[this._todayStr(new Date(Date.now() - i * 86400000))] || 0);
        }
        return {
            today: h[today] || 0,
            week: week,
            month: month,
            total: total,
            streak: this._dailyStreak || 0,
            last7: last7
        };
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
        try {
            if (!this._pushoverSession) {
                this._pushoverSession = new Soup.Session();
            }
            let msg = Soup.Message.new('POST', 'https://api.pushover.net/1/messages.json');
            let body = 'token=' + encodeURIComponent(token) +
                '&user=' + encodeURIComponent(user) +
                '&title=' + encodeURIComponent('Zen Pomodoro') +
                '&message=' + encodeURIComponent(message);
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
