const St = imports.gi.St;
const Applet = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;
const GLib = imports.gi.GLib;
const Pango = imports.gi.Pango;
const Gettext = imports.gettext;
const Tooltips = imports.ui.tooltips;

const UUID = "zen-pomodoro@vtestah";
Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

function _(str) {
    return Gettext.dgettext(UUID, str);
}

var PomodoroMenu = class extends Applet.AppletPopupMenu {
    constructor(launcher, orientation) {
        super(launcher, orientation);
        this._pomodoroCount = 0;
        this._pomodoroSetCount = 0;
        this._pomodoriTotal = 4;
        this._primaryActionMode = "start";

        // Layout category: "idle" (stopped / break-over) or "active" (running / paused).
        this._layoutCategory = "idle";
        // Cache of the last runtime object so a rebuild can restore in-place state.
        this._lastRuntimeState = null;
        // Cache of the preset indicator so a rebuild can restore DOT ornaments.
        this._presetState = {
            activePreset: ""
        };
        this._presets = [];
        this._presetItems = [];
        // Progress bar state (drawn in the status header during active/paused).
        this._progressBarPercent = 0;
        this._progressBarActive = false;
        this._progressBarColor = [0.84, 0.60, 0.19];

        // Appearance (accent colours + font scale), pushed by the applet via
        // setAppearance(); defaults reproduce the original look.
        this._accentFocusCss = "rgb(235, 175, 75)";
        this._accentBreakCss = "rgb(120, 205, 155)";
        this._menuFontScale = 100;

        this._nullWidgetRefs();

        this._applyMenuActorStyle();

        this._rebuildMenu();
        this.updateCounts(0, 0);
    }

    _applyMenuActorStyle() {
        if (this.actor && typeof this.actor.set_style === "function") {
            let scale = this._menuFontScale || 100;
            let minW = Math.round(320 * scale / 100);
            this.actor.set_style(`min-width: ${minW}px; font-size: ${scale}%;`);
        }
    }

    _nullWidgetRefs() {
        this._statusItem = null;
        this._stateBadgeLabel = null;
        this._timeLeftLabel = null;
        this._progressLabel = null;
        this._progressBar = null;
        this._cycleLabel = null;
        this._dailyLabel = null;
        this._taskLabel = null;
        this._sitesLabel = null;
        this._presetSummaryLabel = null;
        this._presetSubmenu = null;
        this._compactInfoLabel = null;
        this._chooseTaskItem = null;
        this._zenItem = null;
        this._focusUntilItem = null;
        this._ambientItem = null;
        this._focusLenSubmenu = null;
        this._focusLength = 0;
        this._primaryActionItem = null;
        this._preset25Item = null;
        this._preset50Item = null;
        this._resetTimerItem = null;
        this._resetAllItem = null;
        this._skipTimerItem = null;
        this._sessionSubmenu = null;
        this._statsSubmenu = null;
        this._statTodayItem = null;
        this._statWeekItem = null;
        this._statMonthItem = null;
        this._statTotalItem = null;
        this._statTimeItem = null;
        this._statStreakItem = null;
        this._statBestItem = null;
        this._statAchieveItem = null;
        this._tasksSubmenu = null;
        this._tasks = [];
        this._tasksCurrentId = "";
        this._taskItems = [];
        this._tasksFinishText = "";
        this._taskTemplates = [];
    }

    _getLayoutCategory(state) {
        if (state === "pomodoro-stop" || state === "break-over") {
            return "idle";
        }
        return "active";
    }

    _rebuildMenu() {
        // Preserve task data (it's state, not widgets) across the teardown.
        let keepTasks = this._tasks;
        let keepCurrentId = this._tasksCurrentId;
        let keepFinish = this._tasksFinishText;
        let keepTemplates = this._taskTemplates;
        this.removeAll();
        this._nullWidgetRefs();
        this._tasks = keepTasks;
        this._tasksCurrentId = keepCurrentId;
        this._tasksFinishText = keepFinish;
        this._taskTemplates = keepTemplates;

        try {
            if (this._layoutCategory === "active") {
                this._buildActiveLayout();
            } else {
                this._buildIdleLayout();
            }
        } catch (e) {
            global.logError(`PomodoroMenu rebuild error: ${e.message}`);
            let fallback = new PopupMenu.PopupMenuItem(_("Error: menu unavailable"));
            fallback.setSensitive(false);
            this.addMenuItem(fallback);
            return;
        }

        // Restore cached visual state into the freshly created widgets.
        this._applyCachedPreset();
        this._updateCycleIndicator();
        if (this._lastRuntimeState) {
            this._applyRuntimeToWidgets(this._lastRuntimeState);
        }
    }

    _makeSectionLabel(text) {
        let item = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        let label = new St.Label({
            text: text,
            style_class: "pomodoro-section"
        });
        item.addActor(label);
        return item;
    }

    _makeInfoRow(labelText, valueText) {
        let item = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        let label = new St.Label({
            text: labelText,
            style_class: "pomodoro-info-label"
        });
        let value = new St.Label({
            text: valueText,
            style_class: "pomodoro-info-value"
        });
        // Let the menu item lay these out as two columns: the label keeps its
        // natural width on the left, the value expands and right-aligns. This
        // mirrors PopupMenuItem's label/status pattern and prevents the label
        // and value from merging.
        item.addActor(label);
        item.addActor(value, { expand: true, span: -1, align: St.Align.END });
        return { item: item, value: value };
    }

    // @PUBLIC_STRIP_BEGIN
    _makeCompactInfoRow(presetLabel, sitesBlocked) {
    // @PUBLIC_STRIP_ELSE
    // _makeCompactInfoRow(presetLabel) {
    // @PUBLIC_STRIP_END
        let item = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        let label = new St.Label({
            // @PUBLIC_STRIP_BEGIN
            text: `${presetLabel}`,
            // @PUBLIC_STRIP_ELSE
            // text: `${presetLabel}`,
            // @PUBLIC_STRIP_END
            style_class: "pomodoro-compact"
        });
        item.addActor(label);
        return { item: item, label: label };
    }

    _stylePrimaryAction() {
        if (!this._primaryActionItem || !this._primaryActionItem.label) {
            return;
        }

        this._primaryActionItem.label.set_style_class_name("pomodoro-primary");
    }

    setAppearance(opts) {
        opts = opts || {};
        if (opts.accentFocus) {
            this._accentFocusCss = opts.accentFocus;
        }
        if (opts.accentBreak) {
            this._accentBreakCss = opts.accentBreak;
        }
        if (typeof opts.fontScale === "number" && opts.fontScale > 0) {
            this._menuFontScale = opts.fontScale;
        }
        this._applyMenuActorStyle();
        // Re-apply colours to whatever is currently shown.
        if (this._lastRuntimeState) {
            this._applyRuntimeToWidgets(this._lastRuntimeState);
        }
    }

    _setPrimaryActionAccent(state) {
        if (!this._primaryActionItem || !this._primaryActionItem.actor) {
            return;
        }

        let breakish = (state === "short-break" || state === "long-break" ||
            state === "short-break-paused" || state === "long-break-paused" || state === "break-over");
        if (this._primaryActionItem.actor) {
            this._primaryActionItem.actor.set_style(null);
        }
        if (this._primaryActionItem.label) {
            this._primaryActionItem.label.set_style_class_name("pomodoro-primary");
            this._primaryActionItem.label.set_style(
                `color: ${breakish ? this._accentBreakCss : this._accentFocusCss};`
            );
        }
    }

    _buildStatusHeader() {
        this._statusItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        let statusBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: "pomodoro-status"
        });

        this._stateBadgeLabel = new St.Label({
            text: _("Ready to focus"),
            style_class: "pomodoro-badge pomodoro-badge-idle"
        });
        this._timeLeftLabel = new St.Label({
            text: "--:--",
            style_class: "pomodoro-time"
        });

        this._progressBar = new St.DrawingArea({
            x_expand: true,
            style: "height: 6px; margin: 1px 0 2px 0;"
        });
        this._progressBar.connect('repaint', (area) => {
            this._repaintProgressBar(area);
        });

        this._progressLabel = new St.Label({
            text: _("Ready to start"),
            style_class: "pomodoro-progress"
        });
        this._cycleLabel = new St.Label({
            text: "",
            style_class: "pomodoro-cycle"
        });
        this._taskLabel = new St.Label({
            text: _("Task will be selected on start"),
            style_class: "pomodoro-task"
        });
        this._taskLabel.set_reactive(true);
        this._taskLabel.set_track_hover(true);
        this._taskLabel.connect('button-press-event', () => { this.emit('choose-task'); return true; });
        new Tooltips.Tooltip(this._taskLabel, _("Change task"));
        this._dailyLabel = new St.Label({
            text: "",
            style_class: "pomodoro-cycle"
        });

        statusBox.add_actor(this._stateBadgeLabel);
        statusBox.add_actor(this._timeLeftLabel);
        statusBox.add_actor(this._progressBar);
        statusBox.add_actor(this._progressLabel);
        statusBox.add_actor(this._taskLabel);
        statusBox.add_actor(this._dailyLabel);
        this._statusItem.addActor(statusBox, { expand: true, span: -1, align: St.Align.START });
        this.addMenuItem(this._statusItem);
    }

    _repaintProgressBar(area) {
        let cr = area.get_context();
        try {
            let [w, h] = area.get_surface_size();

            // Track.
            cr.setSourceRGBA(1, 1, 1, 0.12);
            cr.rectangle(0, 0, w, h);
            cr.fill();

            if (this._progressBarActive) {
                let pct = Math.max(0, Math.min(100, this._progressBarPercent)) / 100;
                let fw = Math.round(w * pct);
                if (fw > 0) {
                    let c = this._progressBarColor || [0.84, 0.60, 0.19];
                    cr.setSourceRGBA(c[0], c[1], c[2], 0.95);
                    cr.rectangle(0, 0, fw, h);
                    cr.fill();
                }
            }
        } finally {
            cr.$dispose();
        }
    }

    _milestoneTier(value, tiers) {
        let best = 0;
        for (let t of tiers) {
            if (value >= t) {
                best = t;
            }
        }
        return best;
    }

    _fmtDuration(min) {
        min = Math.max(0, Math.round(min || 0));
        if (min < 60) {
            return _("%d min").format(min);
        }
        let hrs = Math.floor(min / 60);
        let rem = min % 60;
        return rem ? _("%dh %dm").format(hrs, rem) : _("%dh").format(hrs);
    }

    _updateProgressBar(state, progressPercent) {
        let active = (typeof progressPercent === "number");
        this._progressBarActive = active;
        this._progressBarPercent = active ? progressPercent : 0;

        let breakish = (state === "short-break" || state === "long-break" ||
            state === "short-break-paused" || state === "long-break-paused");
        this._progressBarColor = breakish ? [0.36, 0.78, 0.55] : [0.84, 0.60, 0.19];

        if (this._progressBar) {
            if (active) {
                this._progressBar.show();
            } else {
                this._progressBar.hide();
            }
            this._progressBar.queue_repaint();
        }
    }

    _updateCycleIndicator() {
        if (!this._cycleLabel) {
            return;
        }

        let st = this._lastRuntimeState && this._lastRuntimeState.state;
        if (st === "pomodoro-stop") {
            this._cycleLabel.hide();
            return;
        }
        this._cycleLabel.show();

        let total = this._pomodoriTotal > 0 ? this._pomodoriTotal : 4;
        let current = Math.min(this._pomodoroCount + 1, total);
        let text = _("Pomodoro %d / %d").format(current, total);
        if (this._pomodoroSetCount > 0) {
            text += "  \u00B7  " + Array(this._pomodoroSetCount + 1).join("\u25cf");
        }
        this._cycleLabel.set_text(text);
    }

    _buildPrimaryAction() {
        this._primaryActionItem = new PopupMenu.PopupMenuItem(_("Start focus"));
        this._primaryActionItem.connect("activate", () => {
            if (this._primaryActionMode === "none") {
                return;
            }
            if (this._primaryActionMode === "pause") {
                this.emit('stop-timer');
            } else {
                this.emit('start-timer');
            }
        });
        this.addMenuItem(this._primaryActionItem);
        this._stylePrimaryAction();
    }

    _makeSkipResetItems() {
        let skipItem = new PopupMenu.PopupMenuItem(_("Skip phase"));
        this._skipTimerItem = skipItem;
        skipItem.connect('activate', () => {
            this.emit('skip-timer');
        });

        let resetItem = new PopupMenu.PopupMenuItem(_("Reset timer"));
        this._resetTimerItem = resetItem;
        resetItem.connect('activate', () => {
            this.toggleTimerState(false);
            this.emit('reset-timer');
        });

        return { skipItem: skipItem, resetItem: resetItem };
    }

    _makeResetAllSubmenu() {
        // Confirmation submenu to prevent accidental loss of completed counts.
        let submenu = new PopupMenu.PopupSubMenuMenuItem(_("Reset counters"));
        let confirm = new PopupMenu.PopupMenuItem(_("Reset timer and counters"));
        if (confirm.label) {
            confirm.label.set_style_class_name("pomodoro-reset-confirm");
        }
        confirm.connect('activate', () => {
            this.toggleTimerState(false);
            this.emit('reset-counts');
            this.emit('reset-timer');
        });
        submenu.menu.addMenuItem(confirm);
        this._resetAllItem = submenu;
        return submenu;
    }

    _buildIdleLayout() {
        this._buildStatusHeader();

        this._buildPrimaryAction();

        // Tasks — the header task line is the quick picker; this manages the list.
        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._tasksSubmenu = new PopupMenu.PopupSubMenuMenuItem(_("Task list"));
        this.addMenuItem(this._tasksSubmenu);
        this._populateTasksSubmenu();
        // Cap + scroll the task list instead of growing toward full screen.
        // open() resets the scrollbar policy from the top menu's max-height, so
        // re-apply it (deferred, after open settles) when the list is long.
        if (this._tasksSubmenu.menu && this._tasksSubmenu.menu.actor) {
            this._tasksSubmenu.menu.actor.add_style_class_name("pomodoro-tasks-scroll");
            this._tasksSubmenu.menu.connect('open-state-changed', (menu, isOpen) => {
                if (!isOpen || !menu.actor) { return; }
                GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                    if (menu.actor) {
                        let adj = menu.actor.get_vscroll_bar().get_adjustment();
                        menu.actor.vscrollbar_policy = (adj.upper > 322) ? St.PolicyType.AUTOMATIC : St.PolicyType.NEVER;
                    }
                    return GLib.SOURCE_REMOVE;
                });
            });
        }

        // Session setup — length + preset together.
        this.addMenuItem(this._makeSectionLabel(_("Session")));
        this._focusLenSubmenu = new PopupMenu.PopupSubMenuMenuItem(_("Focus length"));
        this.addMenuItem(this._focusLenSubmenu);
        this._populateFocusLenSubmenu();
        this._presetSubmenu = new PopupMenu.PopupSubMenuMenuItem(_("Preset"));
        this.addMenuItem(this._presetSubmenu);
        this._populatePresetSubmenu();
        // These labels get a value appended; don't let it ellipsize to "Прес…".
        if (this._focusLenSubmenu.label) { this._focusLenSubmenu.label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE); }
        if (this._presetSubmenu.label) { this._presetSubmenu.label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE); }

        // Modes — optional extras and toggles.
        this.addMenuItem(this._makeSectionLabel(_("Modes")));
        this._focusUntilItem = new PopupMenu.PopupMenuItem(_("Focus until\u2026"));
        this._focusUntilItem.connect('activate', () => { this.emit('focus-until'); });
        this.addMenuItem(this._focusUntilItem);

        this._zenItem = new PopupMenu.PopupMenuItem(_("Zen mode"));
        this._zenItem.connect('activate', () => { this.emit('toggle-zen'); });
        this.addMenuItem(this._zenItem);

        this._ambientItem = new PopupMenu.PopupSwitchMenuItem(_("Ambient sound"), false);
        this._ambientItem.connect('toggled', (item, state) => this.emit('set-ambient', state));
        this.addMenuItem(this._ambientItem);

        // @PUBLIC_STRIP_BEGIN
        let sitesRow = this._makeInfoRow(_("Site blocking"), _("off"));
        this._sitesLabel = sitesRow.value;
        this.addMenuItem(sitesRow.item);
        // @PUBLIC_STRIP_END

        // Statistics.
        this.addMenuItem(this._makeSectionLabel(_("Statistics")));
        this._statTodayItem = new PopupMenu.PopupMenuItem(_("Today: %d").format(0));
        this._statTodayItem.setSensitive(false);
        this.addMenuItem(this._statTodayItem);
        this._statStreakItem = new PopupMenu.PopupMenuItem(_("Streak: %d days (best %d)").format(0, 0));
        this._statStreakItem.setSensitive(false);
        this.addMenuItem(this._statStreakItem);
        let dashItem = new PopupMenu.PopupMenuItem(_("Details\u2026"));
        dashItem.connect('activate', () => { this.emit('open-stats'); });
        this.addMenuItem(dashItem);

        // Less used.
        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.addMenuItem(this._makeResetAllSubmenu());
        let quickStart = new PopupMenu.PopupMenuItem(_("Setup wizard\u2026"));
        quickStart.connect('activate', () => this.emit('open-onboarding'));
        this.addMenuItem(quickStart);
    }

    _buildActiveLayout() {
        this._buildStatusHeader();

        this._buildPrimaryAction();

        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        let sr = this._makeSkipResetItems();
        this.addMenuItem(sr.skipItem);
        this.addMenuItem(sr.resetItem);
        this.addMenuItem(this._makeResetAllSubmenu());
    }

    toggleTimerState(state) {
        this._primaryActionMode = state ? "pause" : "start";
    }

    updateRuntimeState(runtime) {
        runtime = runtime || {};
        let state = runtime.state || "pomodoro-stop";
        let newCategory = this._getLayoutCategory(state);

        this._lastRuntimeState = runtime;

        if (newCategory !== this._layoutCategory) {
            // Category changed: tear down and rebuild. The rebuild re-applies
            // the cached runtime to the new widgets, so no further work needed.
            this._layoutCategory = newCategory;
            this._rebuildMenu();
            return;
        }

        // Same category: update labels and styles in-place.
        this._applyRuntimeToWidgets(runtime);
    }

    // Brightest contrasting colour for the popup: near-white on a dark menu,
    // near-black on a light one. Keeps the big time prominent (like the mock)
    // without breaking light themes.
    _brightTextColor() {
        try {
            let c = this.box.get_theme_node().get_background_color();
            if (c.alpha > 20) {
                let lum = (0.2126 * c.red + 0.7152 * c.green + 0.0722 * c.blue) / 255;
                return lum < 0.5 ? "rgba(255, 255, 255, 0.96)" : "rgba(20, 20, 20, 0.95)";
            }
        } catch (e) {}
        return "rgba(255, 255, 255, 0.96)";
    }

    _applyRuntimeToWidgets(runtime) {
        runtime = runtime || {};
        let state = runtime.state || "pomodoro-stop";
        let activePreset = runtime.activePreset || "unknown";
        let task = runtime.task || "";
        let selectedTask = runtime.selectedTask || "";
        let timeLeft = runtime.timeLeft || "";
        let progressPercent = runtime.progressPercent;
        let isIdle = (state === "pomodoro-stop" || state === "break-over");

        if (typeof runtime.pomodoriTotal === "number") {
            this._pomodoriTotal = runtime.pomodoriTotal;
        }
        if (typeof runtime.pomodoriDone === "number") {
            this._pomodoroCount = runtime.pomodoriDone;
        }
        if (typeof runtime.setsDone === "number") {
            this._pomodoroSetCount = runtime.setsDone;
        }
        this._updateCycleIndicator();

        if (this._dailyLabel) {
            let goal = runtime.dailyGoal || 0;
            if (goal > 0) {
                let count = runtime.dailyCount || 0;
                let text = _("Today: %d / %d").format(count, goal);
                if (count >= goal) {
                    text += "  \u2713";
                }
                if (runtime.streak && runtime.streak > 0) {
                    text += "   \u{1F525}" + runtime.streak;
                }
                this._dailyLabel.set_text(text);
                this._dailyLabel.show();
            } else {
                this._dailyLabel.hide();
            }
        }

        // Reflect quick-access state (idle-layout widgets only).
        if (this._ambientItem && typeof runtime.ambientOn === "boolean") {
            this._ambientItem.setToggleState(runtime.ambientOn);
        }
        if (this._focusLenSubmenu && typeof runtime.focusLength === "number" &&
            runtime.focusLength !== this._focusLength) {
            this._focusLength = runtime.focusLength;
            this._populateFocusLenSubmenu();
        }

        if (this._statTodayItem && runtime.stats) {
            let st = runtime.stats;
            if (this._statTodayItem) {
                this._statTodayItem.label.set_text(_("Today: %d").format(st.today || 0));
            }
            if (this._statWeekItem) {
                let wk = st.week || 0;
                let lw = st.lastWeek || 0;
                let txt = _("Last 7 days: %d").format(wk);
                if (lw > 0) {
                    let pct = Math.round((wk - lw) / lw * 100);
                    let arrow = (pct > 0) ? "▲" : ((pct < 0) ? "▼" : "■");
                    txt += "  " + arrow + " " + Math.abs(pct) + "%";
                }
                this._statWeekItem.label.set_text(txt);
            }
            if (this._statMonthItem) {
                this._statMonthItem.label.set_text(_("Last 30 days: %d").format(st.month || 0));
            }
            if (this._statTotalItem) {
                this._statTotalItem.label.set_text(_("All time: %d").format(st.total || 0));
            }
            if (this._statTimeItem) {
                this._statTimeItem.label.set_text(_("Focus time: %s today · %s total").format(this._fmtDuration(st.todayMin || 0), this._fmtDuration(st.totalMinutes || 0)));
            }
            if (this._statStreakItem) {
                this._statStreakItem.label.set_text(_("Streak: %d days (best %d)").format(st.streak || 0, st.longestStreak || 0));
            }
            if (this._statBestItem) {
                this._statBestItem.label.set_text(_("Best day: %d").format(st.bestDay || 0));
            }
            if (this._statAchieveItem) {
                let tot = this._milestoneTier(st.total || 0, [10, 25, 50, 100, 250, 500, 1000, 2000]);
                let stk = this._milestoneTier(st.longestStreak || 0, [3, 7, 14, 30, 60, 100, 365]);
                let badges = [];
                if (tot > 0) {
                    badges.push("🏆 " + tot);
                }
                if (stk > 0) {
                    badges.push("🔥 " + stk);
                }
                this._statAchieveItem.label.set_text(_("Milestones: %s").format(badges.length ? badges.join("   ") : _("none yet")));
            }
        }

        let badge = runtime.stateLabel || _("Ready to focus");

        if (this._progressLabel) {
            if (state === "pomodoro-stop") {
                this._progressLabel.hide();
            } else {
                this._progressLabel.show();
                if (typeof progressPercent === "number") {
                    let line;
                    if (state === "pomodoro" || state === "pomodoro-paused") {
                        let total = runtime.pomodoriTotal || 4;
                        let cur = Math.min(total, (runtime.pomodoriDone || 0) + 1);
                        line = _("Pomodoro %d of %d").format(cur, total);
                    } else if (state === "long-break" || state === "long-break-paused") {
                        line = _("Long break");
                    } else {
                        line = _("Short break");
                    }
                    if (runtime.endTime && state !== "pomodoro" && state !== "pomodoro-paused") {
                        line += ` \u00B7 ` + _("until %s").format(runtime.endTime);
                    }
                    if ((state === "pomodoro" || state === "pomodoro-paused") && runtime.finishEstimate) {
                        line += ` \u00B7 ` + _("\u2248 finish %s").format(runtime.finishEstimate.time);
                    }
                    this._progressLabel.set_text(line);
                } else if (state === "break-over") {
                    this._progressLabel.set_text(_("Break finished — press Start for focus"));
                } else if (runtime.finishEstimate) {
                    this._progressLabel.set_text(_("Finish your tasks by ~%s").format(runtime.finishEstimate.time));
                } else {
                    this._progressLabel.set_text(_("%d min focus — press Start").format(runtime.focusMinutes || 25));
                }
            }
        }

        this._updateProgressBar(state, progressPercent);

        let badgeAccent = null;
        if (state === "pomodoro" || state === "pomodoro-paused") {
            badgeAccent = this._accentFocusCss;
        } else if (state === "short-break" || state === "long-break" ||
            state === "short-break-paused" || state === "long-break-paused" || state === "break-over") {
            badgeAccent = this._accentBreakCss;
        }

        if (this._stateBadgeLabel) {
            this._stateBadgeLabel.set_text(badge.toUpperCase());
            this._stateBadgeLabel.set_style_class_name(badgeAccent ? "pomodoro-badge" : "pomodoro-badge pomodoro-badge-idle");
            this._stateBadgeLabel.set_style(badgeAccent ? `color: ${badgeAccent};` : null);
        }
        if (this._timeLeftLabel) {
            let tl = timeLeft;
            if (!tl && isIdle) {
                let mins = runtime.focusMinutes || this._focusLength || 25;
                tl = mins + ":00";
            }
            this._timeLeftLabel.set_text(tl || "--:--");
            this._timeLeftLabel.set_style_class_name("pomodoro-time");
            this._timeLeftLabel.set_style("color: " + this._brightTextColor() + ";");
        }

        if (this._taskLabel) {
            let name = task || ((selectedTask && isIdle) ? selectedTask : "");
            if (name) {
                this._taskLabel.set_text(this._taskHeaderText(name));
            } else if (state === "pomodoro-stop") {
                this._taskLabel.set_text(_("Task will be selected on start"));
            } else {
                this._taskLabel.set_text(_("Task: none"));
            }
        }

        // @PUBLIC_STRIP_BEGIN
        let siteN = (typeof runtime.blockedSitesCount === "number") ? runtime.blockedSitesCount : 0;
        let sitesText = (siteN <= 0) ? _("off")
            : (runtime.focusBlockActive ? _("blocking %d").format(siteN) : _("%d in list").format(siteN));
        // @PUBLIC_STRIP_END

        // Idle layout: separate Sites and Preset info rows.
        // @PUBLIC_STRIP_BEGIN
        if (this._sitesLabel) {
            this._sitesLabel.set_text(sitesText);
        }
        // @PUBLIC_STRIP_END
        if (this._presetSummaryLabel) {
            this._presetSummaryLabel.set_text(activePreset);
        }
        if (this._presetSubmenu && this._presetSubmenu.label) {
            this._presetSubmenu.label.set_text(_("Preset") + ": " + activePreset);
        }

        // Active layout: single compact "preset · status" row.
        if (this._compactInfoLabel) {
            // @PUBLIC_STRIP_BEGIN
            this._compactInfoLabel.set_text(`${activePreset} \u00B7 ${sitesText}`);
            // @PUBLIC_STRIP_ELSE
            // this._compactInfoLabel.set_text(`${activePreset}`);
            // @PUBLIC_STRIP_END
        }




        if (this._chooseTaskItem) {
            this._chooseTaskItem.setSensitive(state === "pomodoro-stop");
        }
        if (this._zenItem && this._zenItem.actor) {
            if (runtime.zenEnabled) {
                this._zenItem.actor.show();
            } else {
                this._zenItem.actor.hide();
            }
        }
        if (this._focusUntilItem && this._focusUntilItem.actor) {
            if (runtime.focusUntilEnabled) {
                this._focusUntilItem.actor.show();
            } else {
                this._focusUntilItem.actor.hide();
            }
        }

        if (this._primaryActionItem) {
            this._primaryActionItem.setSensitive(true);
            if (runtime.timerPaused) {
                let resumeLabel = (state === "short-break-paused" || state === "long-break-paused")
                    ? _("Resume break") : _("Resume focus");
                this._primaryActionItem.setLabel(resumeLabel);
                this._primaryActionItem.setOrnament(PopupMenu.OrnamentType.NONE);
                this._primaryActionMode = "resume";
            } else if (runtime.timerRunning) {
                if (runtime.strictFocus && state === "pomodoro") {
                    // Strict focus: no casual pause — stay with the block.
                    this._primaryActionItem.setLabel(_("Focusing — stay with it"));
                    this._primaryActionItem.setOrnament(PopupMenu.OrnamentType.NONE);
                    this._primaryActionItem.setSensitive(false);
                    this._primaryActionMode = "none";
                } else {
                    this._primaryActionItem.setLabel(state === "pomodoro" ? _("Pause focus") : _("Pause break"));
                    this._primaryActionItem.setOrnament(PopupMenu.OrnamentType.CHECK, true);
                    this._primaryActionMode = "pause";
                }
            } else if (state === "break-over") {
                this._primaryActionItem.setLabel(_("Start next focus"));
                this._primaryActionItem.setOrnament(PopupMenu.OrnamentType.NONE);
                this._primaryActionMode = "start";
            } else {
                this._primaryActionItem.setLabel(_("Start focus"));
                this._primaryActionItem.setOrnament(PopupMenu.OrnamentType.NONE);
                this._primaryActionMode = "start";
            }
            this._stylePrimaryAction();
            this._setPrimaryActionAccent(state);
        }

        if (this._skipTimerItem) {
            let canSkip = Boolean(runtime.timerRunning || runtime.timerPaused);
            if (runtime.strictFocus && state === "pomodoro" && runtime.timerRunning) {
                canSkip = false;
            }
            this._skipTimerItem.setSensitive(canSkip);
        }
        if (this._resetTimerItem) {
            this._resetTimerItem.setSensitive(state !== "pomodoro-stop" || Boolean(runtime.timerRunning || runtime.timerPaused));
        }
    }

    _taskHeaderText(fallbackName) {
        let cur = this._tasks && this._tasks.find((t) => t.id === this._tasksCurrentId);
        if (cur) {
            let s = "\u25cf " + cur.title;
            let dt = cur.doneToday || 0;
            if (cur.est > 0) {
                s += "   " + dt + "/" + cur.est + " \ud83c\udf45";
            } else if (dt > 0) {
                s += "   " + dt + " \ud83c\udf45";
            }
            return s;
        }
        return "\u25cf " + fallbackName;
    }

    setTasks(list, currentId, finishText, templates) {
        this._tasks = Array.isArray(list) ? list : [];
        this._tasksCurrentId = currentId || "";
        this._tasksFinishText = finishText || "";
        this._taskTemplates = Array.isArray(templates) ? templates : [];
        this._populateTasksSubmenu();
        if (this._tasksSubmenu && this._tasksSubmenu.label) {
            let cur = this._tasks.find((t) => t.id === this._tasksCurrentId);
            this._tasksSubmenu.label.set_text(_("Task list") + (cur ? (": " + cur.title) : ""));
        }
    }

    _populateTasksSubmenu() {
        if (!this._tasksSubmenu) {
            return;
        }
        // Destroying the focused row would move key focus out of the menu and
        // close it. Park focus on the stable submenu header first.
        if (this._tasksSubmenu.menu.isOpen && this._tasksSubmenu.actor) {
            this._tasksSubmenu.actor.grab_key_focus();
        }
        this._tasksSubmenu.menu.removeAll();
        this._taskItems = [];
        let add = new PopupMenu.PopupMenuItem(_("Add task…"));
        add.connect('activate', () => this.emit('add-task'));
        this._tasksSubmenu.menu.addMenuItem(add);
        if (this._tasksFinishText) {
            let fin = new PopupMenu.PopupMenuItem(this._tasksFinishText);
            fin.setSensitive(false);
            this._tasksSubmenu.menu.addMenuItem(fin);
        }
        let list = this._tasks || [];
        if (!list.length) {
            let hint = new PopupMenu.PopupMenuItem(_("No tasks yet — add what you'll focus on, with a 🍅 estimate."));
            hint.setSensitive(false);
            hint.label.clutter_text.line_wrap = true;
            hint.label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
            hint.label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            hint.label.set_style("max-width: 25em;");
            this._tasksSubmenu.menu.addMenuItem(hint);
            return;
        }
        this._tasksSubmenu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        for (let task of list) {
            let t = task;
            let item = new PopupMenu.PopupBaseMenuItem();
            let row = new St.BoxLayout({ vertical: false, x_expand: true });
            let mark = new St.Label({ text: t.completed ? "✓" : (t.id === this._tasksCurrentId ? "●" : "  ") });
            if (t.completed) {
                mark.set_style("color: rgb(120, 205, 155);");
            } else if (t.id === this._tasksCurrentId) {
                mark.set_style("color: rgb(235, 175, 75);");
            }
            row.add_child(mark);
            let dt = t.doneToday || 0;
            let prog = (t.est > 0) ? (dt + "/" + t.est + " 🍅") : (dt > 0 ? (dt + " 🍅") : "");
            let label = new St.Label({ x_expand: true, text: " " + t.title + (prog ? "   " + prog : "") });
            row.add_child(label);
            let editBtn = new St.Button({
                style_class: "pomodoro-task-btn", can_focus: false,
                child: new St.Icon({ icon_name: "document-edit-symbolic", icon_size: 14 })
            });
            editBtn.connect('clicked', () => { this.emit('task-edit', t.id); return true; });
            new Tooltips.Tooltip(editBtn, _("Edit task"));
            row.add_child(editBtn);
            let doneBtn = new St.Button({
                style_class: "pomodoro-task-btn", can_focus: false,
                child: new St.Icon({ icon_name: t.completed ? "edit-undo-symbolic" : "object-select-symbolic", icon_size: 14 })
            });
            doneBtn.connect('button-release-event', (a, ev) => { if (ev.get_button() === 1) { GLib.idle_add(GLib.PRIORITY_DEFAULT, () => { this.emit('task-complete', t.id); return GLib.SOURCE_REMOVE; }); } return true; });
            new Tooltips.Tooltip(doneBtn, t.completed ? _("Reopen task") : _("Mark done"));
            row.add_child(doneBtn);
            let delBtn = new St.Button({
                style_class: "pomodoro-task-btn", can_focus: false,
                child: new St.Icon({ icon_name: "edit-delete-symbolic", icon_size: 14 })
            });
            delBtn.connect('button-release-event', (a, ev) => { if (ev.get_button() === 1) { GLib.idle_add(GLib.PRIORITY_DEFAULT, () => { this.emit('task-delete', t.id); return GLib.SOURCE_REMOVE; }); } return true; });
            new Tooltips.Tooltip(delBtn, _("Delete task"));
            row.add_child(delBtn);
            item.addActor(row, { expand: true, span: -1 });
            item.connect('activate', () => this.emit('select-task', t.id));
            this._tasksSubmenu.menu.addMenuItem(item);
            this._taskItems.push({ item: item, task: t });
        }
    }


    _populateFocusLenSubmenu() {
        if (!this._focusLenSubmenu) {
            return;
        }
        this._focusLenSubmenu.menu.removeAll();
        let cur = this._focusLength || 0;
        [15, 25, 30, 45, 50].forEach((min) => {
            let it = new PopupMenu.PopupMenuItem(_("%d min").format(min));
            it.setOrnament(PopupMenu.OrnamentType.DOT, min === cur);
            it.connect('activate', () => this.emit('set-focus-length', min));
            this._focusLenSubmenu.menu.addMenuItem(it);
        });
        if (cur > 0) {
            this._focusLenSubmenu.label.set_text(_("Focus length") + ": " + _("%d min").format(cur));
        }
    }

    setPresets(list, activeName) {
        this._presets = Array.isArray(list) ? list : [];
        if (typeof activeName === "string") {
            this._presetState.activePreset = activeName;
        }
        this._populatePresetSubmenu();
        this._applyCachedPreset();
    }

    _presetItemLabel(p) {
        return p.name + "   " + p.pomodoro + "/" + p.short_break + "/" + p.long_break + "  \u00d7" + p.pomodori;
    }

    _populatePresetSubmenu() {
        if (!this._presetSubmenu) {
            return;
        }
        this._presetSubmenu.menu.removeAll();
        this._presetItems = [];
        let active = this._presetState ? this._presetState.activePreset : "";
        let list = (this._presets && this._presets.length) ? this._presets : [
            { name: "Classic", pomodoro: 25, short_break: 5, long_break: 15, pomodori: 4 },
            { name: "Long focus", pomodoro: 50, short_break: 10, long_break: 20, pomodori: 4 }
        ];
        for (let i = 0; i < list.length; i++) {
            let preset = list[i];
            let item = new PopupMenu.PopupMenuItem(this._presetItemLabel(preset));
            item.connect('activate', () => {
                this.emit('apply-preset', preset);
            });
            item.setOrnament(PopupMenu.OrnamentType.CHECK, preset.name === active);
            this._presetSubmenu.menu.addMenuItem(item);
            this._presetItems.push({ item: item, preset: preset });
        }
    }

    _applyCachedPreset() {
        let preset = this._presetState || {};

        if (this._presetSummaryLabel && preset.activePreset) {
            this._presetSummaryLabel.set_text(preset.activePreset);
        }
        if (this._presetSubmenu && this._presetSubmenu.label && preset.activePreset) {
            this._presetSubmenu.label.set_text(_("Preset") + ": " + preset.activePreset);
        }
        // @PUBLIC_STRIP_BEGIN
        if (this._compactInfoLabel && preset.activePreset && this._lastRuntimeState) {
            let siteN = (typeof this._lastRuntimeState.blockedSitesCount === "number") ? this._lastRuntimeState.blockedSitesCount : 0;
            let t = (siteN <= 0) ? _("off")
                : (this._lastRuntimeState.focusBlockActive ? _("blocking %d").format(siteN) : _("%d in list").format(siteN));
            this._compactInfoLabel.set_text(`${preset.activePreset} \u00B7 ${t}`);
        }
        // @PUBLIC_STRIP_ELSE
        // if (this._compactInfoLabel && preset.activePreset) {
        //     this._compactInfoLabel.set_text(`${preset.activePreset}`);
        // }
        // @PUBLIC_STRIP_END
        let active = preset.activePreset || "";
        for (let entry of (this._presetItems || [])) {
            entry.item.setOrnament(PopupMenu.OrnamentType.CHECK, entry.preset.name === active);
        }
    }

    showPomodoroInProgress(pomodoriNumber) {
        if (typeof pomodoriNumber === "number" && pomodoriNumber > 0) {
            this._pomodoriTotal = pomodoriNumber;
        }
        this._updateCycleIndicator();
    }

    updateCounts(setCount, pomodoroCount) {
        this._pomodoroSetCount = setCount;
        this._pomodoroCount = pomodoroCount;
        this._updateCycleIndicator();
    }
}
