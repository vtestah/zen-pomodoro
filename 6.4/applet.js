const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Applet = imports.ui.applet;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const ModalDialog = imports.ui.modalDialog;
const PopupMenu = imports.ui.popupMenu;
const Settings = imports.ui.settings;
const Util = imports.misc.util;
const CinnamonEntry = imports.ui.cinnamonEntry;
const ByteArray = imports.byteArray;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Dialog = imports.ui.dialog;
const Meta = imports.gi.Meta;

const UUID = "zen-pomodoro@vtestah";

let TimerModule, SoundModule, DialogsModule, MenuModule, ConstantsModule;

if (typeof require !== 'undefined') {
    TimerModule = require('./timer');
    SoundModule = require('./sound');
    DialogsModule = require('./dialogs');
    MenuModule = require('./menu');
    ConstantsModule = require('./constants');
} else {
    const AppletDir = imports.ui.appletManager.applets[UUID];
    TimerModule = AppletDir.timer;
    SoundModule = AppletDir.sound;
    DialogsModule = AppletDir.dialogs;
    MenuModule = AppletDir.menu;
    ConstantsModule = AppletDir.constants;
}

const Gettext = imports.gettext;
Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

// @PUBLIC_STRIP_BEGIN
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
} = ConstantsModule;

function _(str) {
    return Gettext.dgettext(UUID, str);
}

// this function is useful for development of the applet
// as we can quickly disable long running settings for quick tuning
// i.e a setting of 25 in the options can mean 25 seconds if we comment out the '* 60'
// makes it easy to test all of the timers quickly
function convertMinutesToSeconds(minutes) {
    return minutes * 60;
}

function main(metadata, orientation, panelHeight, instanceId) {
    return new PomodoroApplet(metadata, orientation, panelHeight, instanceId);
}

class PomodoroApplet extends Applet.TextIconApplet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);
        this._metadata = metadata;

        // 'pomodoro', 'pomodoro-stop', 'short-break', 'long-break', 'break-over', '*-paused'
        this._currentState = 'pomodoro-stop';
        this._focusBlockActive = false;
        this._focusFrame = null;
        this._focusFrames = [];
        this._focusTaskChip = null;
        this._focusTaskChipLabel = null;
        this._focusRitualLabel = null;
        this._focusRitualTimeouts = [];
        this._focusGlowFrames = [];
        this._glowBreakish = false;
        this._glowProgress = 0;
        this._glowCurrentElapsed = 0;
        this._glowSegments = 0;
        this._glowBreathBoost = 0;
        this._glowBreathedForTimer = false;
        this._glowBreathTimeouts = [];
        this._appearancePreviewTimeout = 0;
        this._breathingPreviewTimeout = 0;
        this._focusFrameMonitorsChangedId = null;
        this._focusFramePulseSourceId = null;
        this._focusFrameLastTicks = null;
        this._currentFocusTask = "";
        this._taskSelectOnly = false;
        this._breakOverFrom = "";
        this._timerPauseInProgress = false;
        this._pausedState = "";

        // Number of finished pomodori in the current set.
        this._numPomodoriFinished = 0;
        // Number of finished sets.
        this._numPomodoroSetFinished = 0;
        this._setTimerLabel(0);
        this._updatePanelFocusCue();

        // option settings, values are bound in _bindSettings
        // using _opt prefix to make them easy to identify
        this._opt_pomodoroTimeMinutes = null;
        this._opt_shortBreakTimeMinutes = null;
        this._opt_longBreakTimeMinutes = null;
        this._opt_pomodoriNumber = null;
        this._opt_startAutomaticallyOnLoad = null;
        this._opt_showDialogMessages = null;
        this._opt_autoContinueAfterPomodoro = null;
        this._opt_autoContinueAfterShortBreak = null;
        this._opt_autoStartNewAfterFinish = null;
        this._opt_displayIconInPanel = null;
        this._opt_showTimerInPanel = null;
        this._opt_hotkey = null;
        this._opt_playTickerSound = null;
        this._opt_tickerSoundPath = null;
        this._opt_tickerSoundVolume = null;
        this._opt_playBreakSound = null;
        this._opt_breakSoundPath = null;
        this._opt_breakSoundVolume = null;
        this._opt_playWarnSound = null;
        this._opt_warnSoundDelay = null;
        this._opt_warnSoundPath = null;
        this._opt_warnSoundVolume = null;
        this._opt_playStartSound = null;
        this._opt_startSoundPath = null;
        this._opt_startSoundVolume = null;
        this._opt_enableScripts = null;
        this._opt_customShortBreakScript = null;
        this._opt_customLongBreakScript = null;
        this._opt_focusShowTaskChip = null;
        this._opt_focusCalmEnding = null;
        this._opt_focusStartRitual = null;
        this._opt_presetTasks = null;
        this._opt_requireFocusTask = null;
        this._opt_themePreset = null;
        this._opt_accentFocusColor = null;
        this._opt_accentBreakColor = null;
        this._opt_frameStyle = null;
        this._opt_glowIntensity = null;
        this._opt_glowProgressWidth = null;
        this._opt_breathingPattern = null;
        this._opt_chipPosition = null;
        this._opt_ritualSeconds = null;
        this._opt_reduceMotion = null;
        this._opt_menuFontScale = null;
        this._opt_sessionRecovery = null;
        this._opt_panelProgressIcon = null;
        this._opt_dailyGoal = null;
        this._opt_autoPauseIdle = null;
        this._opt_autoPauseIdleMinutes = null;
        this._opt_autoResumeOnActivity = null;
        this._opt_flowExtend = null;
        this._opt_flowExtendMinutes = null;
        this._opt_focusAmbientSound = null;
        this._opt_focusAmbientVolume = null;
        this._opt_breakBreathing = null;
        this._opt_zenModeEnabled = null;
        this._opt_focusUntilEnabled = null;

        this._dailyCount = 0;
        this._dailyStreak = 0;
        this._idleMonitor = null;
        this._idleWatchId = 0;
        this._activeWatchId = 0;
        this._ambientPid = 0;
        this._zenOverlay = null;
        this._zenTimeLabel = null;
        this._zenTaskLabel = null;
        this._zenActive = false;
        this._breathOverlay = null;
        this._breathArea = null;
        this._breathSourceId = 0;
        this._breathStartMs = 0;

        this._settingsProvider = new Settings.AppletSettings(this, metadata.uuid, instanceId);
        this._bindSettings();

        this._defaultSoundPath = metadata.path + '/../sounds';
        this._sounds = {};
        this._loadSoundEffects();

        // If cinnamon crashes or restarts, we want to make sure no zombie sounds are still looping
        let killLoopingSoundCommand = `python3 ${metadata.path}/../bin/kill-looping-sound.py ${this._sounds.tick.getSoundPath()}`;
        Util.trySpawnCommandLine(killLoopingSoundCommand);

        this._timers = {
            pomodoro: new TimerModule.Timer({ timerLimit: convertMinutesToSeconds(this._opt_pomodoroTimeMinutes) }),
            shortBreak: new TimerModule.Timer({ timerLimit: convertMinutesToSeconds(this._opt_shortBreakTimeMinutes) }),
            longBreak: new TimerModule.Timer({ timerLimit: convertMinutesToSeconds(this._opt_longBreakTimeMinutes) })
        };

        this._timerQueue = new TimerModule.TimerQueue();
        this._resetPomodoroTimerQueue();

        this._createLongBreakDialog();
        this._createShortBreakDialog();
        this._createPomodoroFinishedDialog();
        this._createFocusTaskDialog();
        
        this._appletMenu = this._createMenu(orientation);
        this._updatePresetIndicator();
        this._createFocusFrame();

        this._connectTimerSignals();

        // Trigger for initial setting
        this._onAppletIconChanged();
        this._onShowTimerChanged();

        // Initial setup of the hotkey
        this._updateHotkey();

        // Recover an in-progress focus session that survived a Cinnamon restart.
        this._refreshDailyStatsCache();
        this._restoreSessionState();

        // start timer automatically
        if (this._opt_startAutomaticallyOnLoad && this._currentState === 'pomodoro-stop') {
            this._appletMenu.toggleTimerState(true);
            this._startTimerFromMenu();
        }
    }

    _bindSettings() {
        const emptyCallback = () => {};
    
        this._settingsProvider.bindProperty(
            Settings.BindingDirection.IN,
            "pomodoro_duration",
            "_opt_pomodoroTimeMinutes",
            () => {
                this._onDurationSettingsChanged();
            }
        );
    
        this._settingsProvider.bindProperty(
            Settings.BindingDirection.IN,
            "short_break_duration",
            "_opt_shortBreakTimeMinutes",
            () => {
                this._onDurationSettingsChanged();
            }
        );
    
        this._settingsProvider.bindProperty(
            Settings.BindingDirection.IN,
            "long_break_duration",
            "_opt_longBreakTimeMinutes",
            () => {
                this._onDurationSettingsChanged();
            }
        );
    
        this._settingsProvider.bindProperty(
            Settings.BindingDirection.IN,
            "pomodori_number",
            "_opt_pomodoriNumber",
            () => {
                this._updatePresetIndicator();
                // only take effect if the timer isn't currently running
                // otherwise wait until next pomodoro to take effect
                if (this._timerQueue.isRunning()) {
                    this.__pomodoriNumberChangedWhileRunning = true;
                    return;
                }
                this._resetPomodoroTimerQueue();
            }
        );

        this._settingsProvider.bindProperty(
            Settings.BindingDirection.IN,
            "hotkey",
            "_opt_hotkey",
            () => {
                this._updateHotkey();
            }
        );
    
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "start_automatically_on_load", "_opt_startAutomaticallyOnLoad", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "session_recovery", "_opt_sessionRecovery", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "panel_progress_icon", "_opt_panelProgressIcon", this._onAppletIconChanged.bind(this));
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "daily_goal", "_opt_dailyGoal", () => { this._updateMenuRuntime(); });
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "auto_pause_idle", "_opt_autoPauseIdle", this._updateIdleWatch.bind(this));
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "auto_pause_idle_minutes", "_opt_autoPauseIdleMinutes", this._updateIdleWatch.bind(this));
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "auto_resume_on_activity", "_opt_autoResumeOnActivity", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "flow_extend", "_opt_flowExtend", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "flow_extend_minutes", "_opt_flowExtendMinutes", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "focus_ambient_sound", "_opt_focusAmbientSound", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "focus_ambient_volume", "_opt_focusAmbientVolume", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "break_breathing", "_opt_breakBreathing", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "zen_mode_enabled", "_opt_zenModeEnabled", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "focus_until_enabled", "_opt_focusUntilEnabled", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "show_dialog_messages", "_opt_showDialogMessages", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "auto_start_after_pomodoro_ends", "_opt_autoContinueAfterPomodoro", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "auto_start_after_short_break_ends", "_opt_autoContinueAfterShortBreak", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "auto_start_after_break_ends", "_opt_autoStartNewAfterFinish", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "enable_scripts", "_opt_enableScripts", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "custom_short_break_script", "_opt_customShortBreakScript", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "custom_long_break_script", "_opt_customLongBreakScript", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "focus_show_task_chip", "_opt_focusShowTaskChip", () => { this._updateFocusFrame(); });
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "focus_calm_ending", "_opt_focusCalmEnding", () => { this._updateFocusFrame(); });
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "focus_start_ritual", "_opt_focusStartRitual", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "preset_tasks", "_opt_presetTasks", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "require_focus_task", "_opt_requireFocusTask", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "theme_preset", "_opt_themePreset", () => { this._applyAppearance(); });
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "accent_focus_color", "_opt_accentFocusColor", () => { this._applyAppearance(); });
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "accent_break_color", "_opt_accentBreakColor", () => { this._applyAppearance(); });
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "frame_style", "_opt_frameStyle", () => { this._updateFocusFrame(); });
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "glow_intensity", "_opt_glowIntensity", () => { this._updateFocusFrame(); });
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "glow_progress_width", "_opt_glowProgressWidth", () => { this._updateFocusFrame(); });
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "breathing_pattern", "_opt_breathingPattern", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "chip_position", "_opt_chipPosition", () => { this._updateFocusFrame(); });
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "ritual_seconds", "_opt_ritualSeconds", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "reduce_motion", "_opt_reduceMotion", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "menu_font_scale", "_opt_menuFontScale", () => { this._applyAppearance(); });
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "display_icon", "_opt_displayIconInPanel", this._onAppletIconChanged.bind(this));
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "use_symbolic_icon", "_opt_useSymbolicIconInPanel", this._onAppletIconChanged.bind(this));
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "show_timer", "_opt_showTimerInPanel", this._onShowTimerChanged.bind(this));
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "timer_sound", "_opt_playTickerSound", this._onPlayTickedSoundChanged.bind(this));

        // Binding properties that require updating or recalculating other settings
        this._settingsProvider.bindProperty(
            Settings.BindingDirection.IN,
            "timer_sound_file",
            "_opt_tickerSoundPath",
            () => {
                this._loadSoundEffects();
                this._onPlayTickedSoundChanged();
            }
        );
    
        this._settingsProvider.bindProperty(
            Settings.BindingDirection.IN,
            "timer_sound_volume",
            "_opt_tickerSoundVolume",
            () => {
                if (this._onPlayTickedSoundChanged() === false) {
                    this._playTickerSound(true); // If not playing, play a preview
                }
            }
        );
    
        // Continuing with additional settings properties
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "break_sound", "_opt_playBreakSound", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "break_sound_file", "_opt_breakSoundPath", this._loadSoundEffects.bind(this));
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "break_sound_volume", "_opt_breakSoundVolume", () => this._playBreakSound(true));
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "warn_sound", "_opt_playWarnSound", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "warn_sound_delay", "_opt_warnSoundDelay", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "warn_sound_file", "_opt_warnSoundPath", this._loadSoundEffects.bind(this));
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "warn_sound_volume", "_opt_warnSoundVolume", () => this._playWarnSound(true));
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "start_sound", "_opt_playStartSound", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "start_sound_file", "_opt_startSoundPath", this._loadSoundEffects.bind(this));
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "start_sound_volume", "_opt_startSoundVolume", () => this._playStartSound(true));
    
        let showSoxInfo = true;
        if (Gio.file_new_for_path("/usr/bin/sox").query_exists(null)) {
            showSoxInfo = false;
        }
        this._settingsProvider.setValue('show_sox_info', showSoxInfo);

        // Apply initial appearance (accent colours / font scale / frame style).
        this._applyAppearance();
    }

    _updateHotkey() {
        Main.keybindingManager.removeHotKey(UUID);
    
        if (this._opt_hotkey !== null) {
            // Register the new hotkey with the current keybinding setting
            Main.keybindingManager.addHotKey(UUID, this._opt_hotkey, () => {
                this.on_applet_clicked();
            });
        }
    }
    
    _setTimerLabel(ticks) {
        let timeLeft = this._getFormattedTimeLeft(ticks);
        if (timeLeft === undefined) {
            return;
        }
    
        let timerText = this._getPanelStateLabel();
    
        if (this._currentState !== 'pomodoro-stop' && this._currentState !== 'break-over' && this._opt_showTimerInPanel) {
            timerText += ` ${timeLeft}`;
        }

        let progressPercent = this._getTimerProgressPercent(ticks);
        if (progressPercent !== null) {
            timerText += ` ${progressPercent}%`;
        }

        if (this._numPomodoroSetFinished > 0) {
            timerText += ` \u00B7 ${this._numPomodoroSetFinished}`;
        }

        let focusTask = this._getPanelFocusTask();
        if (focusTask) {
            timerText += ` \u00B7 ${focusTask}`;
        }
    
        this.set_applet_label(timerText);
        this._updateMenuRuntime(ticks);
        if (this._panelProgressArea && this._opt_panelProgressIcon && this._panelProgressArea.visible) {
            this._panelProgressArea.queue_repaint();
        }
    }

    _updateMenuRuntime(ticks = null) {
        if (!this._appletMenu || typeof this._appletMenu.updateRuntimeState !== 'function') {
            return;
        }

        if (ticks === null && this._timerQueue) {
            let timer = this._timerQueue.getCurrentTimer();
            if (timer) {
                ticks = timer.getTicksRemaining();
            }
        }

        let timer = this._timerQueue ? this._timerQueue.getCurrentTimer() : null;
        let progressPercent = this._getTimerProgressPercent(ticks);
        let activePreset = "unknown";
        if (this._opt_pomodoroTimeMinutes !== null && this._opt_shortBreakTimeMinutes !== null &&
            this._opt_longBreakTimeMinutes !== null && this._opt_pomodoriNumber !== null) {
            activePreset = this._getActivePresetLabel();
        }

        let endTime = "";
        if (timer && timer.isRunning() && typeof ticks === "number" && ticks > 0) {
            let end = new Date(Date.now() + ticks * 1000);
            endTime = `${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;
        }

        this._appletMenu.updateRuntimeState({
            state: this._currentState,
            stateLabel: this._getPanelStateLabel(),
            timeLeft: this._getFormattedTimeLeft(ticks),
            progressPercent: progressPercent,
            endTime: endTime,
            task: this._getPanelFocusTask(),
            selectedTask: this._currentFocusTask || "",
            activePreset: activePreset,
            timerRunning: Boolean(timer && timer.isRunning()),
            timerPaused: this._isPausedState(),
            focusBlockActive: this._focusBlockActive,
            blockedSitesCount: this._getBlockedSitesCount(),
            hotkey: this._opt_hotkey || "",
            pomodoriTotal: this._opt_pomodoriNumber || 4,
            pomodoriDone: this._numPomodoriFinished || 0,
            setsDone: this._numPomodoroSetFinished || 0,
            dailyGoal: this._opt_dailyGoal || 0,
            dailyCount: this._dailyCount || 0,
            streak: this._dailyStreak || 0,
            zenEnabled: Boolean(this._opt_zenModeEnabled),
            focusUntilEnabled: Boolean(this._opt_focusUntilEnabled)
        });
    }

    _todayStr(d = new Date()) {
        return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
    }

    _loadDailyStats() {
        let data = { date: "", count: 0, streak: 0, lastGoalMetDate: "" };
        try {
            if (GLib.file_test(POMODORO_STATS_FILE, GLib.FileTest.EXISTS)) {
                let [ok, contents] = GLib.file_get_contents(POMODORO_STATS_FILE);
                if (ok) {
                    let parsed = JSON.parse(ByteArray.toString(contents));
                    if (parsed && typeof parsed === "object") {
                        data.date = parsed.date || "";
                        data.count = parseInt(parsed.count) || 0;
                        data.streak = parseInt(parsed.streak) || 0;
                        data.lastGoalMetDate = parsed.lastGoalMetDate || "";
                    }
                }
            }
        } catch (e) {
            // ignore
        }
        return data;
    }

    _refreshDailyStatsCache() {
        let today = this._todayStr();
        let s = this._loadDailyStats();
        this._dailyCount = (s.date === today) ? s.count : 0;
        this._dailyStreak = s.streak || 0;
    }

    _recordPomodoroCompleted() {
        let today = this._todayStr();
        let yesterday = this._todayStr(new Date(Date.now() - 86400000));
        let s = this._loadDailyStats();
        if (s.date !== today) {
            s.date = today;
            s.count = 0;
        }
        s.count += 1;
        let goal = this._opt_dailyGoal || 0;
        if (goal > 0 && s.count === goal) {
            if (s.lastGoalMetDate === yesterday) {
                s.streak = (s.streak || 0) + 1;
            } else if (s.lastGoalMetDate !== today) {
                s.streak = 1;
            }
            s.lastGoalMetDate = today;
        }
        try {
            GLib.mkdir_with_parents(GLib.path_get_dirname(POMODORO_STATS_FILE), 0o700);
            GLib.file_set_contents(POMODORO_STATS_FILE, JSON.stringify(s));
        } catch (e) {
            // best effort
        }
        this._dailyCount = s.count;
        this._dailyStreak = s.streak || 0;
        this._updateMenuRuntime();
    }

    _clearIdleWatches() {
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
    }

    _updateIdleWatch() {
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
    }

    _updateAmbientSound() {
        if (this._opt_focusAmbientSound && this._currentState === 'pomodoro') {
            this._startAmbientSound();
        } else {
            this._stopAmbientSound();
        }
    }

    _startAmbientSound() {
        if (this._ambientPid) {
            return;
        }
        try {
            if (SoundModule && typeof SoundModule.isPlayable === 'function' && !SoundModule.isPlayable()) {
                return;
            }
        } catch (e) {
            // assume playable
        }
        let vol = Math.max(0, Math.min(1, (this._opt_focusAmbientVolume || 40) / 100));
        try {
            let [ok, pid] = GLib.spawn_async(
                null,
                ['play', '-q', '-n', 'synth', '86400', 'brownnoise', 'vol', String(vol)],
                null,
                GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD |
                    GLib.SpawnFlags.STDOUT_TO_DEV_NULL | GLib.SpawnFlags.STDERR_TO_DEV_NULL,
                null
            );
            if (ok) {
                this._ambientPid = pid;
                GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, (p) => {
                    GLib.spawn_close_pid(p);
                    if (this._ambientPid === p) {
                        this._ambientPid = 0;
                    }
                });
            }
        } catch (e) {
            this._ambientPid = 0;
        }
    }

    _stopAmbientSound() {
        if (!this._ambientPid) {
            return;
        }
        let pid = this._ambientPid;
        try {
            Util.trySpawnCommandLine(`kill ${pid}`);
        } catch (e) {
            // ignore
        }
    }

    _toggleZenMode() {
        this._zenActive = !this._zenActive;
        this._updateZenOverlay();
    }

    _updateZenOverlay() {
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
    }

    _refreshZenLabels() {
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
    }

    _updateBreathingGuide() {
        if (this._opt_breakBreathing && (this._currentState === 'short-break' || this._currentState === 'long-break')) {
            this._startBreathing();
        } else {
            this._stopBreathing();
        }
    }

    _startBreathing() {
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
    }

    _tickBreathing() {
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
    }

    _stopBreathing() {
        if (this._breathSourceId) {
            Mainloop.source_remove(this._breathSourceId);
            this._breathSourceId = 0;
        }
        if (this._breathOverlay) {
            this._breathOverlay.hide();
        }
    }

    // @PUBLIC_STRIP_BEGIN
    _getBlockedSitesCount() {
        let now = GLib.get_monotonic_time();
        if (this.__domainsCountCache !== undefined && this.__domainsCountAt &&
            (now - this.__domainsCountAt) < 5000000) {
            return this.__domainsCountCache;
        }

        let count = 0;
        try {
            let [ok, contents] = GLib.file_get_contents(POMODORO_DOMAINS_FILE);
            if (ok) {
                let text = ByteArray.toString(contents);
                for (let line of text.split(/\r?\n/)) {
                    let l = line.trim();
                    if (!l || l.startsWith("#")) {
                        continue;
                    }
                    count++;
                }
            }
        } catch (e) {
            count = 0;
        }

        this.__domainsCountCache = count;
        this.__domainsCountAt = now;
        return count;
    }
    // @PUBLIC_STRIP_END

    _persistSessionState(force = false) {
        if (!this._opt_sessionRecovery) {
            return;
        }

        let now = GLib.get_monotonic_time();
        if (!force && this.__stateSavedAt && (now - this.__stateSavedAt) < 5000000) {
            return;
        }
        this.__stateSavedAt = now;

        let ticksRemaining = null;
        if (this._timerQueue) {
            let timer = this._timerQueue.getCurrentTimer();
            if (timer) {
                ticksRemaining = timer.getTicksRemaining();
            }
        }

        let data = {
            state: this._currentState,
            ticksRemaining: ticksRemaining,
            focusTask: this._currentFocusTask || "",
            pomodoriDone: this._numPomodoriFinished || 0,
            setsDone: this._numPomodoroSetFinished || 0,
            savedAt: Date.now()
        };

        try {
            GLib.file_set_contents(POMODORO_STATE_FILE, JSON.stringify(data));
        } catch (e) {
            // Persisting state is best-effort; ignore failures.
        }
    }

    _clearSessionState() {
        try {
            if (GLib.file_test(POMODORO_STATE_FILE, GLib.FileTest.EXISTS)) {
                GLib.unlink(POMODORO_STATE_FILE);
            }
        } catch (e) {
            // ignore
        }
        this.__stateSavedAt = null;
    }

    _restoreSessionState() {
        if (!this._opt_sessionRecovery) {
            return;
        }

        let data;
        try {
            if (!GLib.file_test(POMODORO_STATE_FILE, GLib.FileTest.EXISTS)) {
                return;
            }
            let [ok, contents] = GLib.file_get_contents(POMODORO_STATE_FILE);
            if (!ok) {
                return;
            }
            data = JSON.parse(ByteArray.toString(contents));
        } catch (e) {
            return;
        }

        if (!data || typeof data !== "object") {
            return;
        }
        // Stale state is ignored.
        if (typeof data.savedAt !== "number" || (Date.now() - data.savedAt) > POMODORO_STATE_MAX_AGE_MS) {
            this._clearSessionState();
            return;
        }

        let wasFocus = (data.state === "pomodoro" || data.state === "pomodoro-paused");
        if (!wasFocus) {
            // Only an in-progress focus session is worth restoring; otherwise drop it.
            this._clearSessionState();
            return;
        }

        try {
            let total = this._opt_pomodoriNumber || 4;
            let done = Math.max(0, Math.min(total - 1, parseInt(data.pomodoriDone) || 0));

            this._numPomodoroSetFinished = Math.max(0, parseInt(data.setsDone) || 0);
            this._numPomodoriFinished = done;
            this._setCurrentFocusTask(data.focusTask || "");

            // Position the queue at the current (in-progress) pomodoro and load
            // its remaining time, leaving everything PAUSED — the user resumes
            // manually so we never silently re-apply the hosts block / DND.
            let pos = done * 2;
            let positioned = this._timerQueue.setPosition(pos);
            let timer = this._timerQueue.getCurrentTimer();
            let remaining = parseInt(data.ticksRemaining);
            if (positioned && timer === this._timers.pomodoro && !isNaN(remaining) && remaining > 0) {
                this._timerQueue.preventStart(false);
                timer.setRemaining(remaining);
                this._pausedState = "pomodoro";
                this._setCurrentState("pomodoro-paused");
                this._appletMenu.toggleTimerState(false);
                this._appletMenu.updateCounts(this._numPomodoroSetFinished, this._numPomodoriFinished);
                this._setTimerLabel(remaining);
                this._setAppletTooltip(remaining);
                Main.notify(_("Focus session restored — resume when ready"));
            } else {
                // Could not cleanly restore the timer; keep only the counts/task.
                this._appletMenu.updateCounts(this._numPomodoroSetFinished, this._numPomodoriFinished);
            }
        } catch (e) {
            global.logError(`Pomodoro session restore failed: ${e.message}`);
        }
    }
    _updatePanelFocusCue() {
        let actorStyle = "";
        let labelStyle = "";

        if (this._currentState === 'pomodoro' || this._currentState === 'pomodoro-paused') {
            actorStyle = POMODORO_PANEL_FOCUS_CUE_STYLE;
            labelStyle = POMODORO_PANEL_FOCUS_LABEL_STYLE;
        } else if (this._currentState === 'short-break' || this._currentState === 'long-break' ||
            this._currentState === 'short-break-paused' || this._currentState === 'long-break-paused' ||
            this._currentState === 'break-over') {
            actorStyle = POMODORO_PANEL_BREAK_CUE_STYLE;
            labelStyle = POMODORO_PANEL_BREAK_LABEL_STYLE;
        }

        if (this.actor && typeof this.actor.set_style === 'function') {
            this.actor.set_style(actorStyle);
        }

        if (this._applet_label && typeof this._applet_label.set_style === 'function') {
            this._applet_label.set_style(labelStyle);
        }
    }

    _getPanelStateLabel() {
        switch (this._currentState) {
        case 'pomodoro':
            return _('FOCUS');
        case 'pomodoro-paused':
            return _('PAUSED FOCUS');
        case 'short-break':
        case 'long-break':
            return _('BREAK');
        case 'short-break-paused':
        case 'long-break-paused':
            return _('PAUSED BREAK');
        case 'break-over':
            return _('BREAK OVER');
        case 'pomodoro-stop':
        default:
            return _('Ready');
        }
    }
    
    _setAppletTooltip(ticks) {
        let timeLeft = this._getFormattedTimeLeft(ticks);
        let timeLeftExtension = "";
        if (timeLeft !== undefined) {
            timeLeftExtension = ` (${timeLeft})`;
        }
        let focusTaskExtension = "";
        if (this._currentState === 'pomodoro' && this._currentFocusTask) {
            focusTaskExtension = `: ${this._currentFocusTask}`;
        }
    
        let message;
        switch (this._currentState) {
        case 'short-break':
            message = _("Short break running") + timeLeftExtension;
            break;
        case 'short-break-paused':
            message = _("Short break paused") + timeLeftExtension;
            break;
        case 'long-break':
            message = _("Long break running") + timeLeftExtension;
            break;
        case 'long-break-paused':
            message = _("Long break paused") + timeLeftExtension;
            break;
        case 'break-over':
            message = _("Break ended");
            break;
        case 'pomodoro':
            message = _("Pomodori %d, set %d running").format(
                this._numPomodoriFinished + 1, this._numPomodoroSetFinished + 1
            ) + focusTaskExtension + timeLeftExtension;
            break;
        case 'pomodoro-paused':
            message = _("Pomodoro paused") + focusTaskExtension + timeLeftExtension;
            break;
        case 'pomodoro-stop':
            message = _("Waiting to start");
            break;
        default:
            message = "";
            break;
        }
    
        this.set_applet_tooltip(message);
    }

    _normalizeFocusTask(task) {
        if (typeof task !== "string") {
            return "";
        }

        return task.replace(/\s+/g, " ").trim();
    }

    _setCurrentFocusTask(task) {
        this._currentFocusTask = this._normalizeFocusTask(task);
    }

    _clearCurrentFocusTask() {
        this._currentFocusTask = "";
    }

    _getPanelFocusTask() {
        if ((this._currentState !== 'pomodoro' && this._currentState !== 'pomodoro-paused') || !this._currentFocusTask) {
            return "";
        }

        const maxLength = 24;
        if (this._currentFocusTask.length <= maxLength) {
            return this._currentFocusTask;
        }

        return `${this._currentFocusTask.slice(0, maxLength - 3)}...`;
    }
    
    _clearAppletTooltip() {
        this.set_applet_tooltip("");
    }
    
    _getFormattedTimeLeft(ticks) {
        if (typeof ticks !== "number" || isNaN(ticks) || ticks < 0) {
            return;
        }
    
        let minutes = parseInt(ticks / 60);
        let seconds = parseInt(ticks % 60);
    
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    _getCurrentTimerLimitSeconds() {
        switch (this._currentState) {
        case 'pomodoro':
        case 'pomodoro-paused':
            return convertMinutesToSeconds(this._opt_pomodoroTimeMinutes);
        case 'short-break':
        case 'short-break-paused':
            return convertMinutesToSeconds(this._opt_shortBreakTimeMinutes);
        case 'long-break':
        case 'long-break-paused':
            return convertMinutesToSeconds(this._opt_longBreakTimeMinutes);
        default:
            return null;
        }
    }

    _getTimerProgressPercent(ticks) {
        let timerLimit = this._getCurrentTimerLimitSeconds();
        if (timerLimit === null || typeof ticks !== "number" || isNaN(ticks)) {
            return null;
        }

        let elapsed = Math.max(0, Math.min(timerLimit, timerLimit - ticks));
        return Math.round((elapsed / timerLimit) * 100);
    }

    _getTimerRemainingRatio(ticks) {
        let timerLimit = this._getCurrentTimerLimitSeconds();
        if (timerLimit === null || typeof ticks !== "number" || isNaN(ticks) || timerLimit <= 0) {
            return null;
        }

        return Math.max(0, Math.min(1, ticks / timerLimit));
    }

    _getPulseStyle(styles, ticks) {
        if (!styles || styles.length === 0) {
            return POMODORO_FOCUS_FRAME_STYLE;
        }

        let pulseIndex = Math.floor(GLib.get_monotonic_time() / (POMODORO_FOCUS_FRAME_PULSE_INTERVAL_MS * 1000)) % styles.length;
        return styles[pulseIndex];
    }

    _isFocusFramePulseActive(ticks) {
        if (this._opt_reduceMotion) {
            return false;
        }
        if (this._opt_focusCalmEnding) {
            return false;
        }

        let remainingRatio = this._getTimerRemainingRatio(ticks);
        if (remainingRatio === null) {
            return false;
        }

        if (this._currentState === 'pomodoro') {
            return ticks <= 60 || remainingRatio <= 0.05;
        }

        if (this._currentState === 'short-break' || this._currentState === 'long-break') {
            return ticks <= 60 || remainingRatio <= 0.20;
        }

        return false;
    }

    _startFocusFramePulse() {
        if (this._focusFramePulseSourceId !== null) {
            return;
        }

        this._focusFramePulseSourceId = Mainloop.timeout_add(POMODORO_FOCUS_FRAME_PULSE_INTERVAL_MS, () => {
            this._updateFocusFrame(this._focusFrameLastTicks);
            return true;
        });
    }

    _stopFocusFramePulse() {
        if (this._focusFramePulseSourceId === null) {
            return;
        }

        Mainloop.source_remove(this._focusFramePulseSourceId);
        this._focusFramePulseSourceId = null;
    }

    _getFocusFrameStyle(ticks) {
        if (this._currentState === 'break-over') {
            return POMODORO_BREAK_OVER_FRAME_STYLE;
        }

        let remainingRatio = this._getTimerRemainingRatio(ticks);
        if (remainingRatio === null) {
            return this._currentState === 'pomodoro' ? POMODORO_FOCUS_FRAME_NORMAL_STYLE : null;
        }

        if (this._currentState === 'pomodoro') {
            if (ticks <= 60 || remainingRatio <= 0.05) {
                if (this._opt_focusCalmEnding) {
                    return POMODORO_FOCUS_FRAME_WARNING_STYLE;
                }
                return this._getPulseStyle(POMODORO_FOCUS_FRAME_PULSE_STYLES, ticks);
            }

            if (remainingRatio <= 0.20) {
                return POMODORO_FOCUS_FRAME_WARNING_STYLE;
            }

            return POMODORO_FOCUS_FRAME_NORMAL_STYLE;
        }

        if (this._currentState === 'pomodoro-paused') {
            if (remainingRatio <= 0.20) {
                return POMODORO_FOCUS_FRAME_WARNING_STYLE;
            }

            return POMODORO_FOCUS_FRAME_NORMAL_STYLE;
        }

        if (this._currentState === 'short-break' || this._currentState === 'long-break') {
            if (ticks <= 60 || remainingRatio <= 0.20) {
                if (this._opt_focusCalmEnding) {
                    return POMODORO_BREAK_OVER_FRAME_STYLE;
                }
                return this._getPulseStyle(POMODORO_BREAK_FRAME_PULSE_STYLES, ticks);
            }
        }

        if (this._currentState === 'short-break-paused' || this._currentState === 'long-break-paused') {
            return POMODORO_BREAK_OVER_FRAME_STYLE;
        }

        return null;
    }

    _onDurationSettingsChanged() {
        if (this._timers) {
            this._syncTimerLimitsFromOptions();
        }
        this._updatePresetIndicator();
    }

    _syncTimerLimitsFromOptions() {
        this._timers.pomodoro.setTimerLimit(convertMinutesToSeconds(this._opt_pomodoroTimeMinutes));
        this._timers.shortBreak.setTimerLimit(convertMinutesToSeconds(this._opt_shortBreakTimeMinutes));
        this._timers.longBreak.setTimerLimit(convertMinutesToSeconds(this._opt_longBreakTimeMinutes));
    }

    _presetMatches(workMinutes, breakMinutes, longBreakMinutes = breakMinutes, pomodoriNumber = 4) {
        return this._opt_pomodoroTimeMinutes === workMinutes &&
            this._opt_shortBreakTimeMinutes === breakMinutes &&
            this._opt_longBreakTimeMinutes === longBreakMinutes &&
            this._opt_pomodoriNumber === pomodoriNumber;
    }

    _getActivePresetLabel() {
        if (this._presetMatches(25, 5, 15, 4)) {
            return "25/5/15 x4";
        }

        if (this._presetMatches(50, 10, 20, 4)) {
            return "50/10/20 x4";
        }

        return `${this._opt_pomodoroTimeMinutes}/${this._opt_shortBreakTimeMinutes}/${this._opt_longBreakTimeMinutes} x${this._opt_pomodoriNumber}`;
    }

    _updatePresetIndicator() {
        if (!this._appletMenu || typeof this._appletMenu.updatePresetIndicator !== 'function') {
            return;
        }

        this._appletMenu.updatePresetIndicator(
            this._getActivePresetLabel(),
            this._presetMatches(25, 5, 15, 4),
            this._presetMatches(50, 10, 20, 4)
        );
        this._updateMenuRuntime();
    }
    
    _resetPomodoroTimerQueue() {
        this._timerQueue.clear();
    
        for (let i = 1; i <= this._opt_pomodoriNumber; i++) {
            this._timerQueue.addTimer(this._timers.pomodoro);
            if (i === this._opt_pomodoriNumber) {
                this._timerQueue.addTimer(this._timers.longBreak);
            } else {
                this._timerQueue.addTimer(this._timers.shortBreak);
            }
        }
    }
    
    _setCurrentState(newState) {
        this._currentState = newState;
        if (newState !== 'break-over') {
            this._breakOverFrom = "";
        }
        this._updatePanelFocusCue();
        this._onAppletIconChanged();
        this._updateFocusFrame();
        if (this._timerQueue) {
            let timer = this._timerQueue.getCurrentTimer();
            if (timer) {
                this._setTimerLabel(timer.getTicksRemaining());
            }
        }
        if (newState === 'pomodoro-stop') {
            this._clearSessionState();
        } else {
            this._persistSessionState(true);
        }
        this._updateIdleWatch();
        this._updateAmbientSound();
        this._updateBreathingGuide();
        this._updateZenOverlay();
    }

    _setBreakOverState(fromState) {
        this._currentState = 'break-over';
        this._breakOverFrom = fromState || "";
        this._appletMenu.toggleTimerState(false);
        this._updatePanelFocusCue();
        this._onAppletIconChanged();
        this._setTimerLabel(0);
        this._setAppletTooltip(0);
        this._updateFocusFrame(0);
    }

    _isPausedState(state = this._currentState) {
        return state === 'pomodoro-paused' || state === 'short-break-paused' || state === 'long-break-paused';
    }

    _getPausedState(activeState) {
        switch (activeState) {
        case 'pomodoro':
            return 'pomodoro-paused';
        case 'short-break':
            return 'short-break-paused';
        case 'long-break':
            return 'long-break-paused';
        default:
            return activeState;
        }
    }

    _getActiveStateFromPaused(pausedState) {
        switch (pausedState) {
        case 'pomodoro-paused':
            return 'pomodoro';
        case 'short-break-paused':
            return 'short-break';
        case 'long-break-paused':
            return 'long-break';
        default:
            return pausedState;
        }
    }

    _handleTimerStoppedForPause(timer, activeState) {
        if (!this._timerPauseInProgress) {
            return false;
        }

        this._pausedState = activeState;
        this._setCurrentState(this._getPausedState(activeState));
        this._setTimerLabel(timer.getTicksRemaining());
        this._setAppletTooltip(timer.getTicksRemaining());
        this._updateFocusFrame(timer.getTicksRemaining());
        return true;
    }

    _createFocusFrame() {
        if (this._focusFrames && this._focusFrames.length > 0) {
            return;
        }

        this._focusFrames = [];
        this._rebuildFocusFrames();

        if (Main.layoutManager) {
            this._focusFrameMonitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
                this._rebuildFocusFrames();
                this._updateFocusFrame();
            });
        }
    }

    _getFocusFrameMonitors() {
        if (!Main.layoutManager) {
            return [];
        }

        let monitors = Main.layoutManager.monitors || [];
        if (monitors.length > 0) {
            return monitors;
        }

        let primary = Main.layoutManager.primaryMonitor;
        return primary ? [primary] : [];
    }

    _destroyFocusFrameActors() {
        if (!this._focusFrames) {
            this._focusFrames = [];
        }

        for (let frame of this._focusFrames) {
            frame.destroy();
        }

        this._focusFrames = [];
        this._focusFrame = null;

        if (!this._focusGlowFrames) {
            this._focusGlowFrames = [];
        }

        for (let glow of this._focusGlowFrames) {
            glow.destroy();
        }

        this._focusGlowFrames = [];

        if (this._focusTaskChip) {
            this._focusTaskChip.destroy();
            this._focusTaskChip = null;
            this._focusTaskChipLabel = null;
        }

        this._cancelFocusRitual();
        if (this._focusRitualLabel) {
            this._focusRitualLabel.destroy();
            this._focusRitualLabel = null;
        }
    }

    _rebuildFocusFrames() {
        this._destroyFocusFrameActors();

        if (!Main.uiGroup) {
            return;
        }

        for (let monitor of this._getFocusFrameMonitors()) {
            let frame = new St.Widget({
                reactive: false,
                visible: false,
                style: POMODORO_FOCUS_FRAME_STYLE
            });
            Main.uiGroup.add_actor(frame);
            this._focusFrames.push(frame);
        }

        for (let monitor of this._getFocusFrameMonitors()) {
            let glow = new St.DrawingArea({ reactive: false, visible: false });
            glow.connect('repaint', (area) => {
                this._repaintFocusGlow(area);
            });
            Main.uiGroup.add_actor(glow);
            this._focusGlowFrames.push(glow);
        }

        this._focusTaskChip = new St.BoxLayout({
            reactive: false,
            visible: false,
            vertical: false,
            style: POMODORO_FOCUS_TASK_CHIP_STYLE
        });
        this._focusTaskChipLabel = new St.Label({ text: "" });
        this._focusTaskChip.add_actor(this._focusTaskChipLabel);
        Main.uiGroup.add_actor(this._focusTaskChip);

        this._focusRitualLabel = new St.Label({
            reactive: false,
            visible: false,
            text: "",
            style: POMODORO_FOCUS_RITUAL_STYLE
        });
        Main.uiGroup.add_actor(this._focusRitualLabel);

        this._positionFocusFrame();
    }

    _positionFocusFrame() {
        if (!this._focusFrames || this._focusFrames.length === 0 || !Main.layoutManager) {
            return;
        }

        let monitors = this._getFocusFrameMonitors();
        if (monitors.length !== this._focusFrames.length) {
            this._rebuildFocusFrames();
            return;
        }

        for (let i = 0; i < this._focusFrames.length; i++) {
            let frame = this._focusFrames[i];
            let monitor = monitors[i];
            if (!frame || !monitor) {
                continue;
            }

            frame.set_position(monitor.x, monitor.y);
            frame.set_size(monitor.width, monitor.height);
            if (typeof frame.raise_top === 'function') {
                frame.raise_top();
            }
        }

        if (this._focusGlowFrames && this._focusGlowFrames.length === monitors.length) {
            for (let i = 0; i < this._focusGlowFrames.length; i++) {
                let glow = this._focusGlowFrames[i];
                let monitor = monitors[i];
                if (!glow || !monitor) {
                    continue;
                }

                glow.set_position(monitor.x, monitor.y);
                glow.set_size(monitor.width, monitor.height);

                // Inset the drawing to the usable work area so the frame never
                // overlaps a panel (top or bottom).
                let inset = { left: 0, top: 0, right: 0, bottom: 0 };
                try {
                    let ws = null;
                    if (global.workspace_manager) {
                        ws = global.workspace_manager.get_active_workspace();
                    } else if (global.screen) {
                        ws = global.screen.get_active_workspace();
                    }
                    let wa = ws ? ws.get_work_area_for_monitor(i) : null;
                    if (wa) {
                        inset.left = Math.max(0, wa.x - monitor.x);
                        inset.top = Math.max(0, wa.y - monitor.y);
                        inset.right = Math.max(0, (monitor.x + monitor.width) - (wa.x + wa.width));
                        inset.bottom = Math.max(0, (monitor.y + monitor.height) - (wa.y + wa.height));
                    }
                } catch (e) {
                    // Work-area API unavailable; fall back to no inset (the ∩ shape
                    // already leaves the bottom edge open for a bottom panel).
                }
                glow._drawInset = inset;

                if (typeof glow.raise_top === 'function') {
                    glow.raise_top();
                }
            }
        }
    }

    _updateFocusFrame(ticks = null) {
        if (!this._focusFrames || this._focusFrames.length === 0) {
            this._rebuildFocusFrames();
        }

        if (!this._focusFrames || this._focusFrames.length === 0) {
            return;
        }

        this._positionFocusFrame();

        if (ticks === null && this._timerQueue) {
            let timer = this._timerQueue.getCurrentTimer();
            if (timer) {
                ticks = timer.getTicksRemaining();
            }
        }

        this._focusFrameLastTicks = ticks;

        let fstyle = this._opt_frameStyle || 'glow';
        if (fstyle === 'off') {
            this._stopFocusFramePulse();
            this._hideGlowFrames();
            for (let frame of this._focusFrames) {
                frame.hide();
            }
            return;
        }

        if (this._isFocusFramePulseActive(ticks)) {
            this._startFocusFramePulse();
        } else {
            this._stopFocusFramePulse();
        }

        this._updateFocusHud(ticks);

        if (fstyle === 'glow' || fstyle === 'corners') {
            // Glow frame: soft inward vignette + perimeter progress (Cairo).
            // Visible for the whole session (focus and break) so the depleting
            // break ring is meaningful — unlike the classic border, which only
            // appears near the end of a break.
            this._stopFocusFramePulse();
            for (let frame of this._focusFrames) {
                frame.hide();
            }

            if (this._currentState === 'pomodoro-stop') {
                this._hideGlowFrames();
                return;
            }

            let breakish = (this._currentState === 'short-break' || this._currentState === 'long-break' ||
                this._currentState === 'short-break-paused' || this._currentState === 'long-break-paused' ||
                this._currentState === 'break-over');
            this._glowBreakish = breakish;
            let ratio = this._getTimerRemainingRatio(ticks);
            if (breakish) {
                // Break depletes (remaining); no set segments.
                this._glowProgress = (ratio === null) ? 0 : ratio;
                this._glowCurrentElapsed = 0;
                this._glowSegments = 0;
            } else {
                // Focus: the ring shows progress through the whole set, divided
                // into one segment per pomodoro.
                let cur = (ratio === null) ? 0 : (1 - ratio);
                let total = this._opt_pomodoriNumber || 4;
                let done = this._numPomodoriFinished || 0;
                this._glowCurrentElapsed = cur;
                this._glowSegments = total;
                this._glowProgress = Math.max(0, Math.min(1, (done + cur) / total));

                // A single gentle "breath" of light when the last minute begins.
                if (typeof ticks === 'number' && ticks <= 60 && this._currentState === 'pomodoro' &&
                    !this._glowBreathedForTimer) {
                    this._playGlowBreath();
                    this._glowBreathedForTimer = true;
                }
            }

            for (let glow of this._focusGlowFrames) {
                if (typeof glow.raise_top === 'function') {
                    glow.raise_top();
                }
                glow.queue_repaint();
                glow.show();
            }
            return;
        }

        // Classic border frame.
        this._hideGlowFrames();
        let frameStyle = this._getFocusFrameStyle(ticks);
        if (frameStyle === null) {
            this._stopFocusFramePulse();
            for (let frame of this._focusFrames) {
                frame.hide();
            }
            return;
        }
        for (let frame of this._focusFrames) {
            frame.set_style(frameStyle);
            frame.show();
        }
    }

    _hideGlowFrames() {
        if (!this._focusGlowFrames) {
            return;
        }
        for (let glow of this._focusGlowFrames) {
            glow.hide();
        }
    }

    _perimeterPoint(f, x0, y0, x1, y1) {
        // U-shape (∩) path: bottom-left -> up -> across top -> down -> bottom-right.
        // The bottom edge is intentionally left open so the frame never overlaps
        // a bottom panel.
        let sideLen = y1 - y0, topLen = x1 - x0;
        let total = 2 * sideLen + topLen;
        let d = total * Math.max(0, Math.min(1, f));
        if (d <= sideLen) {
            return [x0, y1 - d];
        }
        d -= sideLen;
        if (d <= topLen) {
            return [x0 + d, y0];
        }
        d -= topLen;
        return [x1, y0 + d];
    }

    // Resolve the accent colour [r,g,b] for the current theme preset (or custom).
    _accentRgb(breakish) {
        let preset = this._opt_themePreset || "warm";
        if (preset === "custom") {
            return this._parseColor(breakish ? this._opt_accentBreakColor : this._opt_accentFocusColor, breakish);
        }
        let table = {
            warm: { focus: POMODORO_FOCUS_GLOW_FOCUS_RGB, brk: POMODORO_FOCUS_GLOW_BREAK_RGB },
            cool: { focus: [120, 180, 230], brk: [90, 200, 180] },
            mono: { focus: [200, 200, 205], brk: [170, 175, 180] }
        };
        let t = table[preset] || table.warm;
        return breakish ? t.brk.slice() : t.focus.slice();
    }

    // Parse "rgb(r,g,b)" / "rgba(...)" / "#rrggbb" into [r,g,b], with a safe fallback.
    _parseColor(str, breakish) {
        let fallback = breakish ? POMODORO_FOCUS_GLOW_BREAK_RGB.slice() : POMODORO_FOCUS_GLOW_FOCUS_RGB.slice();
        if (!str || typeof str !== "string") {
            return fallback;
        }
        let m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (m) {
            return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
        }
        m = str.match(/^#([0-9a-fA-F]{6})$/);
        if (m) {
            let h = m[1];
            return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
        }
        return fallback;
    }

    _cssRgb(rgb) {
        return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    }

    // Preset focus tasks from settings (list of {task}) -> array of strings.
    _presetTaskStrings() {
        let arr = this._opt_presetTasks;
        if (!Array.isArray(arr)) {
            return [];
        }
        let out = [];
        for (let row of arr) {
            let t = (row && typeof row.task === "string") ? row.task.replace(/\s+/g, " ").trim() : "";
            if (t) {
                out.push(t);
            }
            if (out.length >= 8) {
                break;
            }
        }
        return out;
    }

    // Push accent colours / font scale to the menu and refresh frame + menu.
    _applyAppearance() {
        if (this._appletMenu && typeof this._appletMenu.setAppearance === "function") {
            this._appletMenu.setAppearance({
                accentFocus: this._cssRgb(this._accentRgb(false)),
                accentBreak: this._cssRgb(this._accentRgb(true)),
                fontScale: this._opt_menuFontScale || 100
            });
        }
        this._updateFocusFrame();
    }

    _isSessionActive() {
        let s = this._currentState;
        return (s === 'pomodoro' || s === 'pomodoro-paused' ||
            s === 'short-break' || s === 'long-break' ||
            s === 'short-break-paused' || s === 'long-break-paused' ||
            s === 'break-over');
    }

    // Settings button: briefly show the focus frame + a sample chip using the
    // current appearance, so the user can tune visuals without a timer.
    _previewAppearance() {
        this._applyAppearance();

        // If a session is running the real frame is already on screen.
        if (this._isSessionActive()) {
            return;
        }

        this._cancelAppearancePreview();
        this._positionFocusFrame();

        let fstyle = this._opt_frameStyle || 'glow';
        let reduce = Boolean(this._opt_reduceMotion);

        if (fstyle === 'glow' || fstyle === 'corners') {
            this._glowBreakish = false;
            this._glowSegments = this._opt_pomodoriNumber || 4;
            this._glowCurrentElapsed = 0.62;
            this._glowProgress = 0.62;
            this._glowBreathBoost = 0;
            for (let glow of this._focusGlowFrames) {
                if (typeof glow.raise_top === 'function') {
                    glow.raise_top();
                }
                glow.queue_repaint();
                glow.show();
                if (reduce) {
                    glow.opacity = 255;
                } else {
                    this._animateActorOpacity(glow, 0, 255, POMODORO_FOCUS_RITUAL_FRAME_FADE_MS, null);
                }
            }
        } else if (fstyle === 'border') {
            for (let frame of this._focusFrames) {
                frame.set_style(POMODORO_FOCUS_FRAME_NORMAL_STYLE);
                frame.show();
                if (reduce) {
                    frame.opacity = 255;
                } else {
                    this._animateActorOpacity(frame, 0, 255, POMODORO_FOCUS_RITUAL_FRAME_FADE_MS, null);
                }
            }
        }
        // fstyle === 'off' → only the sample chip is shown.

        if (this._focusTaskChip && this._focusTaskChipLabel) {
            this._focusTaskChipLabel.set_text(`\u25CF  ${_("Preview")}`);
            this._focusTaskChip.set_style(POMODORO_FOCUS_TASK_CHIP_STYLE);
            let primary = Main.layoutManager ? Main.layoutManager.primaryMonitor : null;
            if (primary) {
                let [, natW] = this._focusTaskChip.get_preferred_width(-1);
                let [, natH] = this._focusTaskChip.get_preferred_height(natW);
                let m = POMODORO_FOCUS_CHIP_MARGIN;
                let pos = this._opt_chipPosition || 'br';
                let left = (pos === 'bl' || pos === 'tl');
                let top = (pos === 'tl' || pos === 'tr');
                let x = left ? (primary.x + m) : (primary.x + primary.width - natW - m);
                let y = top ? (primary.y + m) : (primary.y + primary.height - natH - m);
                this._focusTaskChip.set_position(Math.round(x), Math.round(y));
            }
            if (typeof this._focusTaskChip.raise_top === 'function') {
                this._focusTaskChip.raise_top();
            }
            this._focusTaskChip.show();
        }

        this._appearancePreviewTimeout = Mainloop.timeout_add(3500, () => {
            this._appearancePreviewTimeout = 0;
            this._endAppearancePreview();
            return false;
        });
    }

    _cancelAppearancePreview() {
        if (this._appearancePreviewTimeout) {
            Mainloop.source_remove(this._appearancePreviewTimeout);
            this._appearancePreviewTimeout = 0;
        }
    }

    _endAppearancePreview() {
        // If a real session started meanwhile, let the normal logic own the frame.
        if (this._isSessionActive()) {
            return;
        }
        this._hideGlowFrames();
        for (let frame of this._focusFrames) {
            frame.hide();
        }
        if (this._focusTaskChip) {
            this._focusTaskChip.hide();
        }
    }

    // Settings button: briefly show the breathing guide with the selected pattern.
    _previewBreathing() {
        if (this._isSessionActive()) {
            return;
        }
        this._cancelBreathingPreview();
        this._startBreathing();
        this._breathingPreviewTimeout = Mainloop.timeout_add(9000, () => {
            this._breathingPreviewTimeout = 0;
            this._stopBreathing();
            return false;
        });
    }

    _cancelBreathingPreview() {
        if (this._breathingPreviewTimeout) {
            Mainloop.source_remove(this._breathingPreviewTimeout);
            this._breathingPreviewTimeout = 0;
        }
    }

    _getGlowColor() {
        let base = this._accentRgb(this._glowBreakish);
        if (this._glowBreakish) {
            return base;
        }

        // Focus: gently warm the colour as the current pomodoro nears its end
        // (only for the "warm" preset; other presets stay constant).
        if ((this._opt_themePreset || "warm") !== "warm") {
            return base;
        }
        let p = this._glowCurrentElapsed || 0;
        if (p <= POMODORO_FOCUS_GLOW_END_SHIFT_START) {
            return base;
        }
        let t = Math.min(1, (p - POMODORO_FOCUS_GLOW_END_SHIFT_START) / (1 - POMODORO_FOCUS_GLOW_END_SHIFT_START));
        let a = base, b = POMODORO_FOCUS_GLOW_FOCUS_END_RGB;
        return [
            Math.round(a[0] + (b[0] - a[0]) * t),
            Math.round(a[1] + (b[1] - a[1]) * t),
            Math.round(a[2] + (b[2] - a[2]) * t)
        ];
    }

    _repaintFocusGlow(area) {
        let cr = area.get_context();
        try {
            let [w, h] = area.get_surface_size();
            if (w <= 2 || h <= 2) {
                return;
            }

            let inset = area._drawInset || { left: 0, top: 0, right: 0, bottom: 0 };
            let x0 = inset.left + 1.5;
            let y0 = inset.top + 1.5;
            let x1 = w - inset.right - 1.5;
            let y1 = h - inset.bottom - 1.5;
            if (x1 - x0 < 16 || y1 - y0 < 16) {
                return;
            }

            let rgb = this._getGlowColor();
            let r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;

            // Soft inward glow on TOP / LEFT / RIGHT edges only — the bottom edge
            // is left open so the frame never overlaps a bottom panel.
            let depth = Math.round(Math.min(w, h) * POMODORO_FOCUS_GLOW_DEPTH_RATIO);
            depth = Math.max(POMODORO_FOCUS_GLOW_DEPTH_MIN, Math.min(POMODORO_FOCUS_GLOW_DEPTH_MAX, depth));
            let baseAlpha = (typeof this._opt_glowIntensity === 'number' && this._opt_glowIntensity > 0)
                ? this._opt_glowIntensity / 100 : POMODORO_FOCUS_GLOW_MAX_ALPHA;
            let pw = (typeof this._opt_glowProgressWidth === 'number' && this._opt_glowProgressWidth > 0)
                ? this._opt_glowProgressWidth : POMODORO_FOCUS_GLOW_PROGRESS_WIDTH;
            let maxA = baseAlpha * (1 + (this._glowBreathBoost || 0));
            let cornersOnly = (this._opt_frameStyle === 'corners');
            cr.setLineWidth(1);
            if (cornersOnly) {
                // Short L-brackets in the four corners instead of full edges.
                let armX = Math.max(12, Math.min(60, (x1 - x0) * 0.06));
                let armY = Math.max(12, Math.min(60, (y1 - y0) * 0.06));
                for (let i = 0; i < depth; i++) {
                    let t = 1 - (i / depth);
                    cr.setSourceRGBA(r, g, b, maxA * t * t);
                    let xx0 = x0 + i, xx1 = x1 - i, yy0 = y0 + i, yy1 = y1 - i;
                    if (xx1 <= xx0 || yy1 <= yy0) {
                        continue;
                    }
                    cr.moveTo(xx0, yy0 + armY); cr.lineTo(xx0, yy0); cr.lineTo(xx0 + armX, yy0); cr.stroke();
                    cr.moveTo(xx1 - armX, yy0); cr.lineTo(xx1, yy0); cr.lineTo(xx1, yy0 + armY); cr.stroke();
                    cr.moveTo(xx0, yy1 - armY); cr.lineTo(xx0, yy1); cr.lineTo(xx0 + armX, yy1); cr.stroke();
                    cr.moveTo(xx1 - armX, yy1); cr.lineTo(xx1, yy1); cr.lineTo(xx1, yy1 - armY); cr.stroke();
                }
            } else {
                for (let i = 0; i < depth; i++) {
                    let t = 1 - (i / depth);
                    cr.setSourceRGBA(r, g, b, maxA * t * t);
                    let xx0 = x0 + i, xx1 = x1 - i, yy0 = y0 + i;
                    if (xx1 <= xx0) {
                        continue;
                    }
                    // top
                    cr.moveTo(xx0, yy0);
                    cr.lineTo(xx1, yy0);
                    cr.stroke();
                    // left
                    cr.moveTo(xx0, yy0);
                    cr.lineTo(xx0, y1);
                    cr.stroke();
                    // right
                    cr.moveTo(xx1, yy0);
                    cr.lineTo(xx1, y1);
                    cr.stroke();
                }
            }

            // Faint full ∩ track.
            cr.setLineWidth(pw);
            cr.setSourceRGBA(r, g, b, POMODORO_FOCUS_GLOW_TRACK_ALPHA);
            cr.moveTo(x0, y1);
            cr.lineTo(x0, y0);
            cr.lineTo(x1, y0);
            cr.lineTo(x1, y1);
            cr.stroke();

            // Milestone marks: one per pomodoro boundary during focus
            // (k / segments), or quarters during a break.
            cr.setSourceRGBA(r, g, b, POMODORO_FOCUS_GLOW_TICK_ALPHA);
            let tickFracs = [];
            if (this._glowSegments > 1) {
                for (let k = 1; k < this._glowSegments; k++) {
                    tickFracs.push(k / this._glowSegments);
                }
            } else {
                tickFracs = [0.25, 0.5, 0.75];
            }
            for (let f of tickFracs) {
                let [px, py] = this._perimeterPoint(f, x0, y0, x1, y1);
                cr.arc(px, py, POMODORO_FOCUS_GLOW_TICK_RADIUS, 0, 2 * Math.PI);
                cr.fill();
            }

            // Progress stroke along the ∩ from the bottom-left, going up, across
            // the top, then down the right. Focus fills up; break depletes.
            let frac = Math.max(0, Math.min(1, this._glowProgress || 0));
            if (frac > 0) {
                let sideLen = y1 - y0, topLen = x1 - x0;
                let rem = (2 * sideLen + topLen) * frac;

                cr.setSourceRGBA(r, g, b, POMODORO_FOCUS_GLOW_PROGRESS_ALPHA);
                cr.setLineWidth(pw);
                cr.moveTo(x0, y1);

                let seg = Math.min(sideLen, rem);
                cr.lineTo(x0, y1 - seg);
                rem -= seg;
                if (rem > 0) {
                    seg = Math.min(topLen, rem);
                    cr.lineTo(x0 + seg, y0);
                    rem -= seg;
                }
                if (rem > 0) {
                    seg = Math.min(sideLen, rem);
                    cr.lineTo(x1, y0 + seg);
                    rem -= seg;
                }
                cr.stroke();
            }
        } finally {
            cr.$dispose();
        }
    }

    _updateFocusHud(ticks) {
        let state = this._currentState;

        // On-screen task anchor chip (primary monitor, focus only).
        let showChip = Boolean(this._opt_focusShowTaskChip) &&
            (state === 'pomodoro' || state === 'pomodoro-paused') &&
            Boolean(this._currentFocusTask);
        if (this._focusTaskChip && this._focusTaskChipLabel) {
            if (showChip) {
                let timeStr = this._getFormattedTimeLeft(ticks) || "";
                let prefix = (state === 'pomodoro-paused') ? "\u23F8" : "\u25CF";
                let text = `${prefix}  ${this._currentFocusTask}`;
                if (timeStr) {
                    text += `   ${timeStr}`;
                }
                this._focusTaskChipLabel.set_text(text);
                this._focusTaskChip.set_style(state === 'pomodoro-paused'
                    ? POMODORO_FOCUS_TASK_CHIP_PAUSED_STYLE
                    : POMODORO_FOCUS_TASK_CHIP_STYLE);

                let primary = Main.layoutManager ? Main.layoutManager.primaryMonitor : null;
                if (primary) {
                    let [, natW] = this._focusTaskChip.get_preferred_width(-1);
                    let [, natH] = this._focusTaskChip.get_preferred_height(natW);
                    let m = POMODORO_FOCUS_CHIP_MARGIN;
                    let pos = this._opt_chipPosition || 'br';
                    let left = (pos === 'bl' || pos === 'tl');
                    let top = (pos === 'tl' || pos === 'tr');
                    let x = left ? (primary.x + m) : (primary.x + primary.width - natW - m);
                    let y = top ? (primary.y + m) : (primary.y + primary.height - natH - m);
                    this._focusTaskChip.set_position(Math.round(x), Math.round(y));
                }
                if (typeof this._focusTaskChip.raise_top === 'function') {
                    this._focusTaskChip.raise_top();
                }
                this._focusTaskChip.show();
            } else {
                this._focusTaskChip.hide();
            }
        }
    }

    _animateActorOpacity(actor, fromOpacity, toOpacity, durationMs, onComplete) {
        if (!actor) {
            if (onComplete) {
                onComplete();
            }
            return;
        }

        actor.set_opacity(fromOpacity);
        let steps = Math.max(1, Math.round(durationMs / POMODORO_FOCUS_RITUAL_STEP_MS));
        let i = 0;
        let sourceId = Mainloop.timeout_add(POMODORO_FOCUS_RITUAL_STEP_MS, () => {
            i++;
            let t = i / steps;
            if (t >= 1) {
                actor.set_opacity(toOpacity);
                this._removeRitualTimeout(sourceId);
                if (onComplete) {
                    onComplete();
                }
                return false;
            }
            let eased = 1 - (1 - t) * (1 - t); // easeOutQuad
            actor.set_opacity(Math.round(fromOpacity + (toOpacity - fromOpacity) * eased));
            return true;
        });
        this._focusRitualTimeouts.push(sourceId);
    }

    _removeRitualTimeout(sourceId) {
        if (!this._focusRitualTimeouts) {
            return;
        }
        let idx = this._focusRitualTimeouts.indexOf(sourceId);
        if (idx >= 0) {
            this._focusRitualTimeouts.splice(idx, 1);
        }
    }

    _cancelFocusRitual() {
        if (this._focusRitualTimeouts) {
            for (let id of this._focusRitualTimeouts) {
                Mainloop.source_remove(id);
            }
        }
        this._focusRitualTimeouts = [];

        if (this._focusRitualLabel) {
            this._focusRitualLabel.hide();
        }
    }

    _playFocusStartRitual() {
        if (!this._opt_focusStartRitual || !this._focusRitualLabel) {
            return;
        }

        this._cancelFocusRitual();

        let text = this._currentFocusTask
            ? _("Focus: %s").format(this._currentFocusTask)
            : _("Focus");
        this._focusRitualLabel.set_text(text);

        let primary = Main.layoutManager ? Main.layoutManager.primaryMonitor : null;
        if (primary) {
            let [, natW] = this._focusRitualLabel.get_preferred_width(-1);
            let [, natH] = this._focusRitualLabel.get_preferred_height(natW);
            let x = primary.x + Math.round((primary.width - natW) / 2);
            let y = primary.y + Math.round((primary.height - natH) / 2.4);
            this._focusRitualLabel.set_position(x, y);
        }

        if (typeof this._focusRitualLabel.raise_top === 'function') {
            this._focusRitualLabel.raise_top();
        }
        this._focusRitualLabel.show();

        // Gentle fade-in of the focus frame so the "entry" is smooth, not abrupt.
        let fstyleFade = this._opt_frameStyle || 'glow';
        let framesToFade = (fstyleFade === 'glow' || fstyleFade === 'corners') ? this._focusGlowFrames : this._focusFrames;

        // Hold duration derived from ritual_seconds (fade-in + fade-out ≈ 1.1s).
        let holdMs = Math.max(0, ((this._opt_ritualSeconds || 4) * 1000) - 1100);

        if (this._opt_reduceMotion) {
            // No motion: show frame + label instantly, hold, then hide.
            for (let frame of framesToFade) {
                frame.opacity = 255;
                frame.show();
            }
            this._focusRitualLabel.opacity = 255;
            let holdId = Mainloop.timeout_add(holdMs + 600, () => {
                this._removeRitualTimeout(holdId);
                if (this._focusRitualLabel) {
                    this._focusRitualLabel.hide();
                }
                return false;
            });
            this._focusRitualTimeouts.push(holdId);
            return;
        }

        for (let frame of framesToFade) {
            this._animateActorOpacity(frame, 0, 255, POMODORO_FOCUS_RITUAL_FRAME_FADE_MS, null);
        }

        // Fade the centered label in, hold, then fade out and hide.
        this._animateActorOpacity(this._focusRitualLabel, 0, 255, POMODORO_FOCUS_RITUAL_FADE_IN_MS, () => {
            let holdId = Mainloop.timeout_add(holdMs, () => {
                this._removeRitualTimeout(holdId);
                this._animateActorOpacity(this._focusRitualLabel, 255, 0, POMODORO_FOCUS_RITUAL_FADE_OUT_MS, () => {
                    if (this._focusRitualLabel) {
                        this._focusRitualLabel.hide();
                    }
                });
                return false;
            });
            this._focusRitualTimeouts.push(holdId);
        });
    }

    _cancelGlowBreath() {
        if (this._glowBreathTimeouts) {
            for (let id of this._glowBreathTimeouts) {
                Mainloop.source_remove(id);
            }
        }
        this._glowBreathTimeouts = [];
        this._glowBreathBoost = 0;
    }

    _playGlowBreath() {
        if (this._opt_reduceMotion) {
            return;
        }
        this._cancelGlowBreath();

        let steps = Math.max(1, Math.round(POMODORO_FOCUS_GLOW_BREATH_MS / POMODORO_FOCUS_RITUAL_STEP_MS));
        let i = 0;
        let sourceId = Mainloop.timeout_add(POMODORO_FOCUS_RITUAL_STEP_MS, () => {
            i++;
            let t = Math.min(1, i / steps);
            this._glowBreathBoost = POMODORO_FOCUS_GLOW_BREATH_BOOST * Math.sin(Math.PI * t);
            if (this._focusGlowFrames) {
                for (let glow of this._focusGlowFrames) {
                    glow.queue_repaint();
                }
            }
            if (t >= 1) {
                this._glowBreathBoost = 0;
                let idx = this._glowBreathTimeouts.indexOf(sourceId);
                if (idx >= 0) {
                    this._glowBreathTimeouts.splice(idx, 1);
                }
                if (this._focusGlowFrames) {
                    for (let glow of this._focusGlowFrames) {
                        glow.queue_repaint();
                    }
                }
                return false;
            }
            return true;
        });
        this._glowBreathTimeouts.push(sourceId);
    }

    _playCompletionFlourish(text) {
        // Quick celebratory cue when a pomodoro / set completes.
        this._playGlowBreath();

        if (!this._opt_focusStartRitual || !this._focusRitualLabel) {
            return;
        }

        this._cancelFocusRitual();
        this._focusRitualLabel.set_text("\u2713  " + text);

        let primary = Main.layoutManager ? Main.layoutManager.primaryMonitor : null;
        if (primary) {
            let [, natW] = this._focusRitualLabel.get_preferred_width(-1);
            let [, natH] = this._focusRitualLabel.get_preferred_height(natW);
            let x = primary.x + Math.round((primary.width - natW) / 2);
            let y = primary.y + Math.round((primary.height - natH) / 2.4);
            this._focusRitualLabel.set_position(x, y);
        }
        if (typeof this._focusRitualLabel.raise_top === 'function') {
            this._focusRitualLabel.raise_top();
        }
        this._focusRitualLabel.show();

        this._animateActorOpacity(this._focusRitualLabel, 0, 255, 250, () => {
            let holdId = Mainloop.timeout_add(700, () => {
                let idx = this._focusRitualTimeouts.indexOf(holdId);
                if (idx >= 0) {
                    this._focusRitualTimeouts.splice(idx, 1);
                }
                this._animateActorOpacity(this._focusRitualLabel, 255, 0, 400, () => {
                    if (this._focusRitualLabel) {
                        this._focusRitualLabel.hide();
                    }
                });
                return false;
            });
            this._focusRitualTimeouts.push(holdId);
        });
    }

    _destroyFocusFrame() {
        this._stopFocusFramePulse();
        this._cancelFocusRitual();
        this._cancelGlowBreath();

        if (this._focusFrameMonitorsChangedId && Main.layoutManager) {
            Main.layoutManager.disconnect(this._focusFrameMonitorsChangedId);
            this._focusFrameMonitorsChangedId = null;
        }

        this._destroyFocusFrameActors();
    }
    
    _connectTimerSignals() {
        let timerQueue = this._timerQueue;
        let pomodoroTimer = this._timers.pomodoro;
        let shortBreakTimer = this._timers.shortBreak;
        let longBreakTimer = this._timers.longBreak;
    
        // Connect the timer queue signals

        timerQueue.connect('timer-queue-started', () => {
            this._appletMenu.showPomodoroInProgress(this._opt_pomodoriNumber);
            Main.notify(_("Pomodoro started"));
        });
    
        timerQueue.connect('timer-queue-finished', () => {
            this._numPomodoriFinished = 0;
            this._numPomodoroSetFinished++;
            this._appletMenu.updateCounts(this._numPomodoroSetFinished, this._numPomodoriFinished);
    
            if (this._opt_autoStartNewAfterFinish) {
                if (this._longBreakdialog.state === ModalDialog.State.OPENED) {
                    this._longBreakdialog.close();
                }
                this._startNewTimerQueue();
            } else if (this._opt_showDialogMessages) {
                this._resetTimerQueueState();
                this._setBreakOverState('long-break');
                this._longBreakdialog.open();
            } else {
                this._resetTimerQueueState();
                this._setBreakOverState('long-break');
                Main.notify(_("Break ended"));
            }
        });
    
        timerQueue.connect('timer-queue-reset', () => {
            this._setTimerLabel(0);
        });
    
        timerQueue.connect('timer-queue-before-next-timer', () => {
            let timer = timerQueue.getCurrentTimer();
            if (!this._opt_autoContinueAfterPomodoro && timer === shortBreakTimer) {
                timerQueue.preventStart(true);
                timerQueue.stop();
                this._appletMenu.toggleTimerState(false);
                this._setAppletTooltip(0);
                if (this._opt_showDialogMessages) {
                    this._playStartSound();
                    this._pomodoroFinishedDialog.setExtend(this._opt_flowExtend ? (this._opt_flowExtendMinutes || 5) : 0);
                    this._pomodoroFinishedDialog.open();
                }
            }
            else if (!this._opt_autoContinueAfterShortBreak && timer === pomodoroTimer) {
                timerQueue.preventStart(true);
                timerQueue.stop();
                this._setBreakOverState('short-break');
                if (this._opt_showDialogMessages) {
                    this._playStartSound();
                    this._shortBreakdialog.open();
                }
            }
        });

        // Connect the pomodoro timer signals

        pomodoroTimer.connect('timer-tick', (timer) => {
            this._timerTickUpdate(timer);
            if (timer.getTicksRemaining() === this._opt_warnSoundDelay) {
                this._playWarnSound();
            }
        });
    
        pomodoroTimer.connect('timer-running', () => {
            this._setCurrentState('pomodoro');
            this._playTickerSound();
            this._startFocusBlockIfNeeded(pomodoroTimer.getTicksRemaining());
        });
    
        pomodoroTimer.connect('timer-started', () => {
            this._glowBreathedForTimer = false;
            this._setCurrentState('pomodoro');
            this._playStartSound();
            this._playFocusStartRitual();
            Main.notify(_("Let's go to work!"));
        });
    
        pomodoroTimer.connect('timer-stopped', () => {
            if (this._handleTimerStoppedForPause(pomodoroTimer, 'pomodoro')) {
                this._stopTickerSound();
                return;
            }

            this._setCurrentState('pomodoro-stop');
            this._stopTickerSound();
            this._stopFocusBlockIfNeeded();
            this._clearCurrentFocusTask();
        });

        // connect the short break timer signals

        shortBreakTimer.connect('timer-tick', this._timerTickUpdate.bind(this));
        
        shortBreakTimer.connect('timer-started', () => {
            this._setCurrentState('short-break');
            this._playBreakSound();
            this._numPomodoriFinished++;
            this._appletMenu.updateCounts(this._numPomodoroSetFinished, this._numPomodoriFinished);
            this._appletMenu.showPomodoroInProgress(this._opt_pomodoriNumber);
            this._playCompletionFlourish(_("Pomodoro done"));
            this._recordPomodoroCompleted();
            Main.notify(_("Take a short break"));
            // @PUBLIC_STRIP_BEGIN
            if (this._opt_enableScripts && this._opt_customShortBreakScript) {
                let breakSecs = convertMinutesToSeconds(this._opt_shortBreakTimeMinutes);
                let workSecs = convertMinutesToSeconds(this._opt_pomodoroTimeMinutes);
                this._checkAndExecuteCustomScript(this._opt_customShortBreakScript, breakSecs, workSecs);
            }
            // @PUBLIC_STRIP_END
        });
    
        shortBreakTimer.connect('timer-stopped', () => {
            if (this._handleTimerStoppedForPause(shortBreakTimer, 'short-break')) {
                return;
            }

            this._setCurrentState('pomodoro-stop');
        });
    
        shortBreakTimer.connect('timer-running', () => {
            this._setCurrentState('short-break');
        });

        longBreakTimer.connect('timer-tick', this._timerTickUpdate.bind(this));
        longBreakTimer.connect('timer-tick', this._longBreakdialog.setTimeRemaining.bind(this._longBreakdialog));
    
        longBreakTimer.connect('timer-started', () => {
            this._setCurrentState('long-break');
            this._playBreakSound();
            this._playCompletionFlourish(_("Set complete!"));
            this._recordPomodoroCompleted();
            if (this._opt_showDialogMessages) {
                this._longBreakdialog.open();
            } else {
                Main.notify(_("Take a long break"));
            }
            // @PUBLIC_STRIP_BEGIN
            if (this._opt_enableScripts && this._opt_customLongBreakScript) {
                let breakSecs = convertMinutesToSeconds(this._opt_longBreakTimeMinutes);
                let workSecs = convertMinutesToSeconds(this._opt_pomodoroTimeMinutes);
                this._checkAndExecuteCustomScript(this._opt_customLongBreakScript, breakSecs, workSecs);
            }
            // @PUBLIC_STRIP_END
        });
    
        longBreakTimer.connect('timer-stopped', () => {
            if (this._handleTimerStoppedForPause(longBreakTimer, 'long-break')) {
                return;
            }

            this._setCurrentState('pomodoro-stop');
        });
    
        longBreakTimer.connect('timer-running', () => {
            this._setCurrentState('long-break');
        });
    }
    
    _startNewTimerQueue() {
        this._numPomodoriFinished = 0;
        this._resetTimerQueueState();
        this._timerQueue.start();
    }
    
    _resetTimerQueueState() {
        if (!this.__pomodoriNumberChangedWhileRunning) {
            this._timerQueue.reset();
        } else {
            this._resetPomodoroTimerQueue();
            delete this.__pomodoriNumberChangedWhileRunning;
        }
        this._longBreakdialog.setDefaultLabels();
    }
    
    _turnOff() {
        this._stopFocusBlockIfNeeded();
        this._clearCurrentFocusTask();
        this._resetTimerQueueState();
        this._appletMenu.toggleTimerState(false);
        this._setCurrentState('pomodoro-stop');
        this._setTimerLabel(0);
        this._clearAppletTooltip();
        Main.notify(_("Pomodoro ended"));
    }
    
    _timerTickUpdate(timer) {
        this._setTimerLabel(timer.getTicksRemaining());
        this._setAppletTooltip(timer.getTicksRemaining());
        this._updateFocusFrame(timer.getTicksRemaining());
        this._updateMenuRuntime(timer.getTicksRemaining());
        this._persistSessionState();
        this._refreshZenLabels();
    }
    
    _playTickerSound(previewOnly = false) {
        if (this._opt_playTickerSound) {
            this._sounds.tick.play({ loop: true, volume: this._opt_tickerSoundVolume / 100, preview: previewOnly });
        }
    }
    
    _stopTickerSound() {
        this._sounds.tick.stop();
    }
    
    _playBreakSound(previewOnly = false) {
        if (this._opt_playBreakSound) {
            this._sounds.break.play({ volume: this._opt_breakSoundVolume / 100, preview: previewOnly });
        }
    }
    
    _playWarnSound(previewOnly = false) {
        if (this._opt_playWarnSound) {
            this._sounds.warn.play({ volume: this._opt_warnSoundVolume / 100, preview: previewOnly });
        }
    }
    
    _playStartSound(previewOnly = false) {
        if (this._opt_playStartSound) {
            this._sounds.start.play({ volume: this._opt_startSoundVolume / 100, preview: previewOnly });
        }
    }
    
    _loadSoundEffect(soundEffectInstance, soundPath) {
        soundPath = SoundModule.addPathIfRelative(soundPath, this._defaultSoundPath);
        if (!soundEffectInstance) {
            soundEffectInstance = new SoundModule.SoundEffect(soundPath);
        } else {
            soundEffectInstance.setSoundPath(soundPath);
        }
        return soundEffectInstance;
    }
    
    _loadSoundEffects() {
        if (!SoundModule.isPlayable()) {
            global.logError("Unable to play pomodoro sound, make sure 'play' command is available on your path from the sox package");
        }
    
        this._sounds = this._sounds || {};
        this._sounds.tick = this._loadSoundEffect(this._sounds.tick, this._opt_tickerSoundPath);
        this._sounds.break = this._loadSoundEffect(this._sounds.break, this._opt_breakSoundPath);
        this._sounds.warn = this._loadSoundEffect(this._sounds.warn, this._opt_warnSoundPath);
        this._sounds.start = this._loadSoundEffect(this._sounds.start, this._opt_startSoundPath);
    }

    // @PUBLIC_STRIP_BEGIN
    _runPomodoroScript(filePath, args = []) {
        if (filePath.startsWith('file://')) {
            filePath = filePath.substr(7);
        }

        const fileExists = GLib.file_test(filePath, GLib.FileTest.EXISTS);
        const isExecutable = GLib.file_test(filePath, GLib.FileTest.IS_EXECUTABLE);

        if (!fileExists) {
            global.logError(`Pomodoro custom script file does not exist: ${filePath}`);
            return false;
        }

        if (!isExecutable) {
            global.logError(`Pomodoro custom script does not have executable permissions: ${filePath}`);
            return false;
        }

        try {
            let argv = [filePath].concat(args.map(arg => String(arg)));
            GLib.spawn_async(null, argv, null, GLib.SpawnFlags.STDOUT_TO_DEV_NULL | GLib.SpawnFlags.STDERR_TO_DEV_NULL, null);
            return true;
        } catch (error) {
            global.logError(`Failed to execute Pomodoro custom script file: ${filePath}, error: ${error.message}`);
            return false;
        }
    }

    _checkAndExecuteCustomScript(filePath, duration, workDuration) {
        let args = [];
        if (duration !== undefined && duration !== null) {
            args.push(duration);
        }
        if (workDuration !== undefined && workDuration !== null) {
            args.push(workDuration);
        }
        return this._runPomodoroScript(filePath, args);
    }

    _runFocusPreflight() {
        if (!GLib.file_test(POMODORO_FOCUS_START_SCRIPT, GLib.FileTest.IS_EXECUTABLE)) {
            Main.notify(_("Pomodoro preflight failed"));
            return false;
        }

        try {
            let [ok, stdout, stderr, status] = GLib.spawn_sync(
                null,
                [POMODORO_FOCUS_START_SCRIPT, "--preflight"],
                null,
                GLib.SpawnFlags.NONE,
                null
            );

            if (ok && status === 0) {
                return true;
            }

            let message = "";
            if (stderr && stderr.length > 0) {
                message = ByteArray.toString(stderr).trim();
            } else if (stdout && stdout.length > 0) {
                message = ByteArray.toString(stdout).trim();
            }

            Main.notify(_("Pomodoro preflight failed") + (message ? ": " + message : ""));
            return false;
        } catch (error) {
            Main.notify(_("Pomodoro preflight failed") + ": " + error.message);
            return false;
        }
    }

    _runFocusStartScript(remainingSeconds) {
        return this._runPomodoroScript(POMODORO_FOCUS_START_SCRIPT, [remainingSeconds, this._currentFocusTask]);
    }

    _runFocusStopScript() {
        return this._runPomodoroScript(POMODORO_FOCUS_STOP_SCRIPT);
    }

    _startFocusBlockIfNeeded(remainingSeconds) {
        if (this._focusBlockActive) {
            return false;
        }

        let started = this._runFocusStartScript(remainingSeconds);
        if (started) {
            this._focusBlockActive = true;
        }
        return started;
    }

    _stopFocusBlockIfNeeded() {
        if (!this._focusBlockActive) {
            return false;
        }

        this._focusBlockActive = false;
        return this._runFocusStopScript();
    }
    // @PUBLIC_STRIP_END

    _pauseTimerFromMenu() {
        let timer = this._timerQueue.getCurrentTimer();
        if (!timer || !timer.isRunning()) {
            return;
        }

        this._timerPauseInProgress = true;
        this._pausedState = this._currentState;
        this._timerQueue.stop();
        this._timerPauseInProgress = false;
        this._appletMenu.toggleTimerState(false);
        this._setTimerLabel(timer.getTicksRemaining());
        this._setAppletTooltip(timer.getTicksRemaining());
        this._updateFocusFrame(timer.getTicksRemaining());
    }

    _resumePausedTimerFromMenu() {
        if (!this._isPausedState()) {
            return false;
        }

        this._timerQueue.preventStart(false);
        this._setCurrentState(this._getActiveStateFromPaused(this._currentState));
        this._appletMenu.toggleTimerState(true);
        this._timerQueue.start();
        return true;
    }
    
    _createMenu(orientation) {
        let menuManager = new PopupMenu.PopupMenuManager(this);
        let menu = new MenuModule.PomodoroMenu(this, orientation);
    
        menu.connect('start-timer', () => {
            this._startTimerFromMenu();
        });
    
        menu.connect('stop-timer', () => {
            this._pauseTimerFromMenu();
        });
    
        menu.connect('reset-timer', () => {
            this._timerQueue.reset();
            this._stopFocusBlockIfNeeded();
            this._clearCurrentFocusTask();
            this._setCurrentState('pomodoro-stop');
            this._setTimerLabel(0);
            this._clearAppletTooltip();
        });
    
        menu.connect('reset-counts', () => {
            this._numPomodoriFinished = 0;
            this._numPomodoroSetFinished = 0;
            this._appletMenu.updateCounts(0, 0);
        });

        menu.connect('choose-task', () => {
            this._chooseFocusTaskFromMenu();
        });

        menu.connect('toggle-zen', () => {
            this._toggleZenMode();
        });

        menu.connect('focus-until', () => {
            this._focusUntilFromMenu();
        });

        menu.connect('preset-25-5', () => {
            this._applyDurationPreset(25, 5, 15, 4);
        });

        menu.connect('preset-50-10', () => {
            this._applyDurationPreset(50, 10, 20, 4);
        });

        menu.connect('skip-timer', () => {
            let timer = this._timerQueue.getCurrentTimer();
            this._timerQueue.skip();
            if (timer === this._timers.longBreak) {
                if (!this._opt_autoStartNewAfterFinish) {
                    this._longBreakdialog.close();
                    this._startNewTimerQueue();
                }
            }
        });
    
        menu.connect('what-is-this', () => {
            let command = `xdg-open '${_("http://en.wikipedia.org/wiki/Pomodoro_Technique")}'`;
            Util.trySpawnCommandLine(command);
        });
    
        menuManager.addMenu(menu);
    
        return menu;
    }

    _startTimerFromMenu() {
        this._timerQueue.preventStart(false);
        if (this._resumePausedTimerFromMenu()) {
            return;
        }

        let timer = this._timerQueue.getCurrentTimer();

        if (timer === this._timers.pomodoro && !timer.isRunning()) {
            this._promptFocusTaskBeforeStart();
            return;
        }

        this._timerQueue.start();
    }

    _promptFocusTaskBeforeStart() {
        if (!this._focusTaskDialog) {
            this._startTimerAfterFocusTask("");
            return;
        }

        this._focusTaskDialog.setDefaultTask(this._currentFocusTask, this._presetTaskStrings(), Boolean(this._opt_requireFocusTask));
        this._focusTaskDialog.open();
    }

    _chooseFocusTaskFromMenu() {
        if (!this._focusTaskDialog) {
            return;
        }

        this._taskSelectOnly = true;
        this._focusTaskDialog.setDefaultTask(this._currentFocusTask, this._presetTaskStrings(), Boolean(this._opt_requireFocusTask));
        this._focusTaskDialog.open();
    }

    _focusUntilFromMenu() {
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
    }

    _startFocusForDuration(secs) {
        this._timerQueue.preventStart(false);
        let timer = this._timerQueue.getCurrentTimer();
        if (timer !== this._timers.pomodoro) {
            this._resetTimerQueueState();
            timer = this._timerQueue.getCurrentTimer();
        }
        if (timer !== this._timers.pomodoro) {
            return;
        }
        this._setCurrentFocusTask("");
        timer.setRemaining(secs);
        this._appletMenu.toggleTimerState(true);
        this._timerQueue.start();
    }

    _startTimerAfterFocusTask(task) {
        // @PUBLIC_STRIP_BEGIN
        if (!this._runFocusPreflight()) {
            this._timerQueue.preventStart(true);
            this._appletMenu.toggleTimerState(false);
            return;
        }
        // @PUBLIC_STRIP_END

        this._setCurrentFocusTask(task);
        this._timerQueue.preventStart(false);
        this._timerQueue.start();
    }

    _applyDurationPreset(workMinutes, breakMinutes, longBreakMinutes = breakMinutes, pomodoriNumber = 4) {
        if (this._timerQueue.isRunning() || this._isPausedState()) {
            Main.notify(_("Stop the timer before changing Pomodoro preset"));
            return false;
        }

        this._opt_pomodoroTimeMinutes = workMinutes;
        this._opt_shortBreakTimeMinutes = breakMinutes;
        this._opt_longBreakTimeMinutes = longBreakMinutes;
        this._opt_pomodoriNumber = pomodoriNumber;
        this._settingsProvider.setValue("pomodoro_duration", workMinutes);
        this._settingsProvider.setValue("short_break_duration", breakMinutes);
        this._settingsProvider.setValue("long_break_duration", longBreakMinutes);
        this._settingsProvider.setValue("pomodori_number", pomodoriNumber);
        this._syncTimerLimitsFromOptions();
        this._resetTimerQueueState();
        this._setTimerLabel(0);
        this._clearAppletTooltip();
        this._updatePresetIndicator();
        Main.notify(_("Pomodoro preset %s applied").format(this._getActivePresetLabel()));
        return true;
    }
    
    _createLongBreakDialog() {
        this._longBreakdialog = new DialogsModule.PomodoroSetFinishedDialog();
    
        this._longBreakdialog.connect('switch-off-pomodoro', () => {
            if (!this._timerQueue.isRunning() && !this._opt_autoStartNewAfterFinish) {
                this._turnOff();
            } else {
                this._timerQueue.stop();
                this._appletMenu.toggleTimerState(false);
                this._clearAppletTooltip();
            }
            this._longBreakdialog.close();
        });
    
        this._longBreakdialog.connect('start-new-pomodoro', () => {
            this._timerQueue.skip();
            if (!this._opt_autoStartNewAfterFinish) {
                this._longBreakdialog.close();
                this._startNewTimerQueue();
            }
        });
    
        this._longBreakdialog.connect('hide-pomodoro-modal', () => {
            if (!this._timerQueue.isRunning() && !this._opt_autoStartNewAfterFinish) {
                this._turnOff();
            }
            this._longBreakdialog.close();
        });
    }
    
    _createShortBreakDialog() {
        this._shortBreakdialog = new DialogsModule.PomodoroShortBreakFinishedDialog();
    
        this._shortBreakdialog.connect('continue-current-pomodoro', () => {
            this._shortBreakdialog.close();
            this._timerQueue.preventStart(false);
            this._appletMenu.toggleTimerState(true);
            this._timerQueue.start();
        });
    
        this._shortBreakdialog.connect('pause-pomodoro', () => {
            this._timerQueue.stop();
            this._appletMenu.toggleTimerState(false);
            this._shortBreakdialog.close();
        });
    }

    _createPomodoroFinishedDialog() {
        this._pomodoroFinishedDialog = new DialogsModule.PomodoroFinishedDialog();
    
        this._pomodoroFinishedDialog.connect('continue-current-pomodoro', () => {
            this._pomodoroFinishedDialog.close();
            this._timerQueue.preventStart(false);
            this._appletMenu.toggleTimerState(true);
            this._timerQueue.start();
        });
    
        this._pomodoroFinishedDialog.connect('pause-pomodoro', () => {
            this._timerQueue.stop();
            this._appletMenu.toggleTimerState(false);
            this._pomodoroFinishedDialog.close();
        });

        this._pomodoroFinishedDialog.connect('extend-pomodoro', () => {
            this._pomodoroFinishedDialog.close();
            this._extendFocusFromDialog();
        });
    }

    _extendFocusFromDialog() {
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
    }

    _createFocusTaskDialog() {
        this._focusTaskDialog = new DialogsModule.PomodoroFocusTaskDialog();

        this._focusTaskDialog.connect('focus-task-confirmed', (_dialog, task) => {
            if (this._taskSelectOnly) {
                this._taskSelectOnly = false;
                this._setCurrentFocusTask(task);
                this._updateMenuRuntime();
                return;
            }
            this._startTimerAfterFocusTask(task);
        });

        this._focusTaskDialog.connect('focus-task-cancelled', () => {
            if (this._taskSelectOnly) {
                this._taskSelectOnly = false;
                return;
            }
            this._appletMenu.toggleTimerState(false);
        });
    }

    _removeDialogs() {
        if (this._focusTaskDialog) {
            this._focusTaskDialog.close();
            this._focusTaskDialog.destroy();
            this._focusTaskDialog = null;
        }
        if (this._longBreakdialog) {
            this._longBreakdialog.close();
            this._longBreakdialog.destroy();
            this._longBreakdialog = null;
        }
        if (this._shortBreakdialog) {
            this._shortBreakdialog.close();
            this._shortBreakdialog.destroy();
            this._shortBreakdialog = null;
        }
        if (this._pomodoroFinishedDialog) {
            this._pomodoroFinishedDialog.close();
            this._pomodoroFinishedDialog.destroy();
            this._pomodoroFinishedDialog = null;
        }
    }

    _onAppletIconChanged() {
        if (this._opt_displayIconInPanel) {
            this._applet_icon_box.show();
            let appletIconPath = '';
            let appletIconStatus = '';
            switch (this._currentState) {
            case 'pomodoro-stop':
                appletIconPath = `${this._metadata.path}/../pomodoro-stop`;
                appletIconStatus = 'system-status-icon';
                break;
            case 'short-break':
            case 'long-break':
            case 'short-break-paused':
            case 'long-break-paused':
                appletIconPath = `${this._metadata.path}/../pomodoro-break`;
                appletIconStatus = 'system-status-icon success';
                break;
            case 'pomodoro':
            case 'pomodoro-paused':
            default:
                appletIconPath = `${this._metadata.path}/../pomodoro`;
                appletIconStatus = 'system-status-icon error';
                break;
            }
            if (this._opt_useSymbolicIconInPanel) {
                this.set_applet_icon_symbolic_path(appletIconPath + "-symbolic.svg");
                this._applet_icon.set_style_class_name(appletIconStatus);
            } else {
                this.set_applet_icon_path(appletIconPath + ".png");
            }
        } else if (this._applet_icon_box.child) {
            this._applet_icon_box.hide();
        }

        this._updatePanelProgressIcon();
    }

    _updatePanelProgressIcon() {
        if (this._opt_panelProgressIcon) {
            if (!this._panelProgressArea) {
                let size = Math.max(16, Math.min(28, this._panelHeight || 22));
                this._panelProgressArea = new St.DrawingArea({ reactive: false });
                this._panelProgressArea.set_width(size);
                this._panelProgressArea.set_height(size);
                this._panelProgressArea.connect('repaint', (area) => {
                    this._repaintPanelProgress(area);
                });
                this.actor.insert_child_at_index(this._panelProgressArea, 0);
            }
            this._applet_icon_box.hide();
            this._panelProgressArea.show();
            this._panelProgressArea.queue_repaint();
        } else if (this._panelProgressArea) {
            this._panelProgressArea.hide();
        }
    }

    _repaintPanelProgress(area) {
        let cr = area.get_context();
        try {
            let [w, h] = area.get_surface_size();
            let cx = w / 2, cy = h / 2;
            let radius = Math.min(w, h) / 2 - 2;
            if (radius <= 1) {
                return;
            }

            let breakish = (this._currentState === 'short-break' || this._currentState === 'long-break' ||
                this._currentState === 'short-break-paused' || this._currentState === 'long-break-paused' ||
                this._currentState === 'break-over');
            let r, g, b;
            if (this._currentState === 'pomodoro' || this._currentState === 'pomodoro-paused') {
                r = 1.0; g = 0.69; b = 0.32;
            } else if (breakish) {
                r = 0.42; g = 0.88; b = 0.58;
            } else {
                r = 0.6; g = 0.6; b = 0.6;
            }

            let timer = this._timerQueue ? this._timerQueue.getCurrentTimer() : null;
            let ticks = timer ? timer.getTicksRemaining() : null;
            let pct = this._getTimerProgressPercent(ticks);
            let frac = (typeof pct === "number") ? Math.max(0, Math.min(1, pct / 100)) : 0;

            cr.setLineWidth(2.5);
            cr.setSourceRGBA(r, g, b, 0.25);
            cr.arc(cx, cy, radius, 0, 2 * Math.PI);
            cr.stroke();

            if (frac > 0) {
                let start = -Math.PI / 2;
                cr.setSourceRGBA(r, g, b, 0.95);
                cr.arc(cx, cy, radius, start, start + 2 * Math.PI * frac);
                cr.stroke();
            }
        } finally {
            cr.$dispose();
        }
    }
    
    _onShowTimerChanged() {
        this._setTimerLabel(this._timerQueue.getCurrentTimer().getTicksRemaining());
    }
    
    _onPlayTickedSoundChanged() {
        if (!this._timers.pomodoro.isRunning()) {
            return false;
        }
    
        if (this._opt_playTickerSound) {
            this._playTickerSound();
        } else {
            this._stopTickerSound();
        }
    
        return true;
    }
    
    on_applet_clicked() {
        this._appletMenu.toggle();
    }
    
    on_applet_removed_from_panel() {
        Main.keybindingManager.removeHotKey(UUID);
        this._stopFocusBlockIfNeeded();
        this._cancelAppearancePreview();
        this._cancelBreathingPreview();
        this._clearIdleWatches();
        this._stopAmbientSound();
        this._stopBreathing();
        if (this._zenOverlay) {
            this._zenOverlay.destroy();
            this._zenOverlay = null;
        }
        if (this._breathOverlay) {
            this._breathOverlay.destroy();
            this._breathOverlay = null;
        }
        this._destroyFocusFrame();
        this._clearCurrentFocusTask();
        this._resetTimerQueueState();
        this._settingsProvider.finalize();
        this._removeDialogs();
    }    
}
