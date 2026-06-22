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

let TimerModule, SoundModule, DialogsModule, MenuModule, ConstantsModule, VisualModule, FeaturesModule, SoundFxModule;

if (typeof require !== 'undefined') {
    TimerModule = require('./timer');
    SoundModule = require('./sound');
    DialogsModule = require('./dialogs');
    MenuModule = require('./menu');
    ConstantsModule = require('./constants');
    VisualModule = require('./visual');
    FeaturesModule = require('./features');
    SoundFxModule = require('./soundfx');
} else {
    const AppletDir = imports.ui.appletManager.applets[UUID];
    TimerModule = AppletDir.timer;
    SoundModule = AppletDir.sound;
    DialogsModule = AppletDir.dialogs;
    MenuModule = AppletDir.menu;
    ConstantsModule = AppletDir.constants;
    VisualModule = AppletDir.visual;
    FeaturesModule = AppletDir.features;
    SoundFxModule = AppletDir.soundfx;
}

const Gettext = imports.gettext;
Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

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
        this._orientation = orientation;

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
        this._opt_showSeconds = null;
        this._opt_hotkey = null;
        this._opt_hotkeyToggle = null;
        this._opt_hotkeySkip = null;
        this._opt_startOnClick = null;
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
        this._opt_intervalChime = null;
        this._opt_intervalChimeSeconds = null;
        this._opt_intervalChimeFile = null;
        this._opt_intervalChimeVolume = null;
        this._opt_enableScripts = null;
        this._opt_customShortBreakScript = null;
        this._opt_customLongBreakScript = null;
        this._opt_focusShowTaskChip = null;
        this._opt_focusCalmEnding = null;
        this._opt_focusStartRitual = null;
        this._opt_presetTasks = null;
        this._opt_customPresets = null;
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
        this._opt_focusDnd = null;
        this._opt_runCommandEnabled = null;
        this._opt_focusStartCommand = null;
        this._opt_breakStartCommand = null;
        this._opt_pushoverEnabled = null;
        this._opt_pushoverUserKey = null;
        this._opt_pushoverAppToken = null;
        this._opt_pushoverTitle = null;
        this._opt_pushoverMsgBreak = null;
        this._opt_pushoverMsgResume = null;
        this._opt_pushoverMsgFocus = null;
        this._opt_pushoverSound = null;
        this._opt_pushoverPriority = null;
        this._opt_blockDomains = null;
        this._dndActive = false;
        this._dndPrevValue = null;
        this._notificationSettings = null;
        this._opt_focusAmbientVolume = null;
        this._opt_breakBreathing = null;
        this._opt_zenModeEnabled = null;
        this._opt_focusUntilEnabled = null;

        this._dailyCount = 0;
        this._dailyStreak = 0;
        this._dailyStatsData = null;
        this._idleMonitor = null;
        this._idleWatchId = 0;
        this._activeWatchId = 0;
        this._ambientSound = null;
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

        // sounds/ lives at the UUID root; depending on whether the applet was
        // loaded from a versioned subdirectory (e.g. 6.4/) or from a flattened
        // package, that is either inside metadata.path or one level above it.
        this._defaultSoundPath = metadata.path + '/sounds';
        if (!GLib.file_test(this._defaultSoundPath, GLib.FileTest.IS_DIR) &&
            GLib.file_test(metadata.path + '/../sounds', GLib.FileTest.IS_DIR)) {
            this._defaultSoundPath = metadata.path + '/../sounds';
        }
        this._sounds = {};
        this._loadSoundEffects();

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
        this._loadTasksAsync(() => this._refreshTasksMenu());
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

        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "custom_presets", "_opt_customPresets", () => { this._updatePresetIndicator(); });

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
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "focus_dnd", "_opt_focusDnd", () => this._updateDnd());
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "run_command_enabled", "_opt_runCommandEnabled", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "focus_start_command", "_opt_focusStartCommand", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "break_start_command", "_opt_breakStartCommand", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "pushover_enabled", "_opt_pushoverEnabled", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "pushover_user_key", "_opt_pushoverUserKey", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "pushover_app_token", "_opt_pushoverAppToken", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "pushover_title", "_opt_pushoverTitle", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "pushover_msg_break", "_opt_pushoverMsgBreak", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "pushover_msg_resume", "_opt_pushoverMsgResume", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "pushover_msg_focus", "_opt_pushoverMsgFocus", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "pushover_sound", "_opt_pushoverSound", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "pushover_priority", "_opt_pushoverPriority", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "block_domains", "_opt_blockDomains", emptyCallback);
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
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "show_seconds", "_opt_showSeconds", this._onShowTimerChanged.bind(this));
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "hotkey_toggle", "_opt_hotkeyToggle", this._updateHotkey.bind(this));
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "hotkey_skip", "_opt_hotkeySkip", this._updateHotkey.bind(this));
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "start_on_click", "_opt_startOnClick", emptyCallback);
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
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "interval_chime", "_opt_intervalChime", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "interval_chime_seconds", "_opt_intervalChimeSeconds", emptyCallback);
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "interval_chime_file", "_opt_intervalChimeFile", this._loadSoundEffects.bind(this));
        this._settingsProvider.bindProperty(Settings.BindingDirection.IN, "interval_chime_volume", "_opt_intervalChimeVolume", () => this._playIntervalChime(true));
    
        // Show the "no sound backend" hint only when neither GSound nor a
        // fallback player (paplay / canberra-gtk-play / play) is available.
        this._settingsProvider.setValue('show_sox_info', !SoundModule.isPlayable());

        // Apply initial appearance (accent colours / font scale / frame style).
        this._applyAppearance();

        // Push the loaded presets to the menu now that settings are bound.
        this._updatePresetIndicator();
    }

    _updateHotkey() {
        Main.keybindingManager.removeHotKey(UUID);
        Main.keybindingManager.removeHotKey(UUID + "-toggle");
        Main.keybindingManager.removeHotKey(UUID + "-skip");

        if (this._opt_hotkey) {
            Main.keybindingManager.addHotKey(UUID, this._opt_hotkey, () => {
                this._appletMenu.toggle();
            });
        }
        if (this._opt_hotkeyToggle) {
            Main.keybindingManager.addHotKey(UUID + "-toggle", this._opt_hotkeyToggle, () => {
                this._toggleTimerFromHotkey();
            });
        }
        if (this._opt_hotkeySkip) {
            Main.keybindingManager.addHotKey(UUID + "-skip", this._opt_hotkeySkip, () => {
                if (this._appletMenu) {
                    this._appletMenu.emit('skip-timer');
                }
            });
        }
    }

    _toggleTimerFromHotkey() {
        let timer = this._timerQueue ? this._timerQueue.getCurrentTimer() : null;
        if (timer && timer.isRunning()) {
            this._appletMenu.emit('stop-timer');
        } else {
            this._appletMenu.emit('start-timer');
        }
    }
    
    _setTimerLabel(ticks) {
        let timeLeft = this._getFormattedTimeLeft(ticks);
        if (timeLeft === undefined) {
            return;
        }
    
        let timerText = this._getPanelStateLabel();
    
        if (this._currentState !== 'pomodoro-stop' && this._currentState !== 'break-over' && this._opt_showTimerInPanel) {
            let panelTime = (this._opt_showSeconds === false) ? `${Math.max(0, Math.ceil(ticks / 60))}m` : timeLeft;
            timerText += ` ${panelTime}`;
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
    
        let vertical = (this._orientation === St.Side.LEFT || this._orientation === St.Side.RIGHT);
        if (vertical) {
            // Vertical panels are narrow: show only the remaining minutes (the
            // icon + progress ring carry the rest), or nothing when idle.
            let compact = "";
            if (this._currentState !== 'pomodoro-stop' && this._currentState !== 'break-over' &&
                this._opt_showTimerInPanel && typeof ticks === 'number') {
                compact = `${Math.max(0, Math.ceil(ticks / 60))}`;
            }
            this.set_applet_label(compact);
        } else {
            this.set_applet_label(timerText);
        }
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
            stats: this._computeStats(),
            zenEnabled: Boolean(this._opt_zenModeEnabled),
            focusUntilEnabled: Boolean(this._opt_focusUntilEnabled)
        });
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

    _writeJsonAsync(path, obj) {
        let data;
        try {
            data = JSON.stringify(obj);
        } catch (e) {
            return;
        }
        try {
            GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o700);
            let file = Gio.File.new_for_path(path);
            let bytes = GLib.Bytes.new(ByteArray.fromString(data));
            file.replace_contents_bytes_async(bytes, null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION, null, (f, res) => {
                    try {
                        f.replace_contents_finish(res);
                    } catch (e) {
                        // Persisting is best-effort; ignore failures.
                    }
                });
        } catch (e) {
            // best effort
        }
    }

    _readJsonAsync(path, onResult) {
        let file = Gio.File.new_for_path(path);
        file.load_contents_async(null, (f, res) => {
            let obj = null;
            try {
                let [ok, contents] = f.load_contents_finish(res);
                if (ok) {
                    obj = JSON.parse(ByteArray.toString(contents));
                }
            } catch (e) {
                obj = null;
            }
            onResult(obj);
        });
    }

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

        this._writeJsonAsync(POMODORO_STATE_FILE, data);
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
        this._readJsonAsync(POMODORO_STATE_FILE, (data) => this._applyRestoredSessionState(data));
    }

    _applyRestoredSessionState(data) {
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

    _presetList() {
        let out = [];
        let arr = this._opt_customPresets;
        if (Array.isArray(arr)) {
            for (let p of arr) {
                if (!p) {
                    continue;
                }
                let pom = parseInt(p.pomodoro) || 0;
                let sb = parseInt(p.short_break) || 0;
                let lb = parseInt(p.long_break) || 0;
                let num = parseInt(p.pomodori) || 0;
                if (pom > 0 && sb > 0 && lb > 0 && num > 0) {
                    let name = (p.name || "").toString().trim();
                    out.push({
                        name: name || `${pom}/${sb}/${lb} x${num}`,
                        pomodoro: pom,
                        short_break: sb,
                        long_break: lb,
                        pomodori: num
                    });
                }
            }
        }
        if (out.length === 0) {
            out.push({ name: _("Classic"), pomodoro: 25, short_break: 5, long_break: 15, pomodori: 4 });
            out.push({ name: _("Long focus"), pomodoro: 50, short_break: 10, long_break: 20, pomodori: 4 });
        }
        return out;
    }

    _getActivePresetLabel() {
        let list = this._presetList();
        for (let p of list) {
            if (this._presetMatches(p.pomodoro, p.short_break, p.long_break, p.pomodori)) {
                return p.name;
            }
        }

        return `${this._opt_pomodoroTimeMinutes}/${this._opt_shortBreakTimeMinutes}/${this._opt_longBreakTimeMinutes} x${this._opt_pomodoriNumber}`;
    }

    _updatePresetIndicator() {
        if (!this._appletMenu || typeof this._appletMenu.setPresets !== 'function') {
            return;
        }

        this._appletMenu.setPresets(this._presetList(), this._getActivePresetLabel());
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
        this._updateDnd();
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
        this._sendPushover(this._opt_pushoverMsgResume);
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

    // Resolve the accent colour [r,g,b] for the current theme preset (or custom).

    // Parse "rgb(r,g,b)" / "rgba(...)" / "#rrggbb" into [r,g,b], with a safe fallback.

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

    _isSessionActive() {
        let s = this._currentState;
        return (s === 'pomodoro' || s === 'pomodoro-paused' ||
            s === 'short-break' || s === 'long-break' ||
            s === 'short-break-paused' || s === 'long-break-paused' ||
            s === 'break-over');
    }

    // Settings button: briefly show the focus frame + a sample chip using the
    // current appearance, so the user can tune visuals without a timer.

    // Settings button: briefly show the breathing guide with the selected pattern.

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
            let rem = timer.getTicksRemaining();
            if (rem === this._opt_warnSoundDelay) {
                this._playWarnSound();
            }
            if (this._opt_intervalChime && this._opt_intervalChimeSeconds > 0 &&
                rem > 0 && (rem % this._opt_intervalChimeSeconds) === 0) {
                this._playIntervalChime();
            }
        });
    
        pomodoroTimer.connect('timer-running', () => {
            this._setCurrentState('pomodoro');
            this._playTickerSound();
            if (this._opt_enableScripts) this._startFocusBlockIfNeeded(pomodoroTimer.getTicksRemaining());
        });
    
        pomodoroTimer.connect('timer-started', () => {
            this._glowBreathedForTimer = false;
            this._setCurrentState('pomodoro');
            this._playStartSound();
            this._playFocusStartRitual();
            Main.notify(_("Let's go to work!"));
            this._runEventCommand('focus');
            this._sendPushover(this._opt_pushoverMsgFocus);
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
            this._runEventCommand('break');
            this._sendPushover(this._opt_pushoverMsgBreak);
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
            this._runEventCommand('break');
            this._sendPushover(this._opt_pushoverMsgBreak);
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
    

    

    

    

    

    
    _loadSoundEffect(soundEffectInstance, soundPath) {
        soundPath = SoundModule.addPathIfRelative(soundPath, this._defaultSoundPath);
        if (!soundEffectInstance) {
            soundEffectInstance = new SoundModule.SoundEffect(soundPath);
        } else {
            soundEffectInstance.setSoundPath(soundPath);
        }
        return soundEffectInstance;
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

        if (this._currentState === 'pomodoro') {
            this._recordInterruption();
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

        menu.connect('apply-preset', (m, preset) => {
            this._applyDurationPreset(preset.pomodoro, preset.short_break, preset.long_break, preset.pomodori);
        });

        menu.connect('open-stats', () => {
            this._showStatsDashboard();
        });

        menu.connect('add-task', () => {
            this._showAddTaskDialog();
        });
        menu.connect('select-task', (m, id) => {
            this._setCurrentTaskId(id);
        });
        menu.connect('toggle-task-done', () => {
            if (this._tasksData) { this._toggleTaskCompleted(this._tasksData.currentId); }
        });
        menu.connect('delete-task', () => {
            if (this._tasksData) { this._deleteTask(this._tasksData.currentId); }
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
        if (this._opt_enableScripts && !this._runFocusPreflight()) {
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

            // Ready state: replace the empty grey ring with a meaningful brand
            // mark — a faint track, today's progress toward the daily goal, and
            // a centred "tomato" dot that reads as "ready to start".
            if (this._currentState === 'pomodoro-stop') {
                let goal = this._opt_dailyGoal || 0;
                let done = this._dailyCount || 0;
                let met = (goal > 0 && done >= goal);
                let ar = met ? 0.42 : 1.0;
                let ag = met ? 0.88 : 0.69;
                let ab = met ? 0.58 : 0.32;
                cr.setLineWidth(2.5);
                cr.setSourceRGBA(ar, ag, ab, 0.22);
                cr.arc(cx, cy, radius, 0, 2 * Math.PI);
                cr.stroke();
                if (goal > 0 && done > 0) {
                    let f = Math.min(1, done / goal);
                    let start = -Math.PI / 2;
                    cr.setSourceRGBA(ar, ag, ab, 0.95);
                    cr.arc(cx, cy, radius, start, start + 2 * Math.PI * f);
                    cr.stroke();
                }
                // Centre: a little tomato (red body + green leaf) — a nod to the Pomodoro.
                let tr = radius * 0.66;
                cr.setSourceRGBA(0.91, 0.33, 0.27, 0.98);
                cr.arc(cx, cy + tr * 0.12, tr, 0, 2 * Math.PI);
                cr.fill();
                cr.setSourceRGBA(0.40, 0.80, 0.46, 0.98);
                cr.setLineWidth(Math.max(1.0, tr * 0.30));
                let ty = cy - tr * 0.62;
                cr.moveTo(cx, ty);
                cr.lineTo(cx, cy - tr * 0.05);
                cr.stroke();
                cr.moveTo(cx - tr * 0.5, ty - tr * 0.05);
                cr.lineTo(cx, cy - tr * 0.15);
                cr.stroke();
                cr.moveTo(cx + tr * 0.5, ty - tr * 0.05);
                cr.lineTo(cx, cy - tr * 0.15);
                cr.stroke();
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
    
    on_orientation_changed(orientation) {
        this._orientation = orientation;
        let timer = this._timerQueue ? this._timerQueue.getCurrentTimer() : null;
        this._setTimerLabel(timer ? timer.getTicksRemaining() : 0);
    }

    on_applet_clicked() {
        if (this._opt_startOnClick && this._currentState === 'pomodoro-stop') {
            this._startTimerFromMenu();
            return;
        }
        this._appletMenu.toggle();
    }
    
    on_applet_removed_from_panel() {
        Main.keybindingManager.removeHotKey(UUID);
        Main.keybindingManager.removeHotKey(UUID + "-toggle");
        Main.keybindingManager.removeHotKey(UUID + "-skip");
        this._stopFocusBlockIfNeeded();
        this._cancelAppearancePreview();
        this._cancelBreathingPreview();
        this._clearIdleWatches();
        this._stopAllSounds();
        this._disableDnd();
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

VisualModule.install(PomodoroApplet.prototype);
FeaturesModule.install(PomodoroApplet.prototype);
SoundFxModule.install(PomodoroApplet.prototype);
