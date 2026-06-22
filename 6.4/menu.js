const St = imports.gi.St;
const Applet = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;
const GLib = imports.gi.GLib;
const Gettext = imports.gettext;

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
        this._hotkeyItem = null;
        this._hotkeyLabel = null;
        this._chooseTaskItem = null;
        this._zenItem = null;
        this._focusUntilItem = null;
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
        this._statsChart = null;
        this._statsHeatmap = null;
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
        this.removeAll();
        this._nullWidgetRefs();

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
            text: `${presetLabel} \u00B7 ${sitesBlocked ? _("blocked") : _("ready")}`,
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

        let topRow = new St.BoxLayout({ vertical: false, x_expand: true });
        this._stateBadgeLabel = new St.Label({
            text: _("READY"),
            style_class: "pomodoro-badge pomodoro-badge-idle"
        });
        this._timeLeftLabel = new St.Label({
            text: "--:--",
            style_class: "pomodoro-time"
        });
        let timeBin = new St.Bin({ x_align: St.Align.END, x_expand: true });
        timeBin.add_actor(this._timeLeftLabel);
        topRow.add_actor(this._stateBadgeLabel);
        topRow.add_actor(timeBin);

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
        this._dailyLabel = new St.Label({
            text: "",
            style_class: "pomodoro-cycle"
        });

        statusBox.add_actor(topRow);
        statusBox.add_actor(this._progressBar);
        statusBox.add_actor(this._progressLabel);
        statusBox.add_actor(this._cycleLabel);
        statusBox.add_actor(this._taskLabel);
        statusBox.add_actor(this._dailyLabel);
        this._statusItem.addActor(statusBox);
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

    _repaintStatsHeatmap(area) {
        let cr = area.get_context();
        try {
            let [w, h] = area.get_surface_size();
            let data = this._statsHeatmap || [];
            let cols = 12;
            let rows = 7;
            let maxv = 1;
            for (let v of data) {
                if (v > maxv) {
                    maxv = v;
                }
            }
            let gap = 2;
            let cw = Math.max(2, (w - gap * (cols - 1)) / cols);
            let ch = Math.max(2, (h - gap * (rows - 1)) / rows);
            let c = this._progressBarColor || [0.84, 0.60, 0.19];
            for (let col = 0; col < cols; col++) {
                for (let row = 0; row < rows; row++) {
                    let idx = col * rows + row;
                    let v = (idx < data.length) ? data[idx] : 0;
                    let x = Math.round(col * (cw + gap));
                    let y = Math.round(row * (ch + gap));
                    if (v > 0) {
                        cr.setSourceRGBA(c[0], c[1], c[2], 0.25 + 0.75 * (v / maxv));
                    } else {
                        cr.setSourceRGBA(1, 1, 1, 0.08);
                    }
                    cr.rectangle(x, y, Math.round(cw), Math.round(ch));
                    cr.fill();
                }
            }
        } finally {
            cr.$dispose();
        }
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
        let skipItem = new PopupMenu.PopupMenuItem(_("Skip step"));
        this._skipTimerItem = skipItem;
        skipItem.connect('activate', () => {
            this.emit('skip-timer');
        });

        let resetItem = new PopupMenu.PopupMenuItem(_("Reset session"));
        this._resetTimerItem = resetItem;
        resetItem.connect('activate', () => {
            this.toggleTimerState(false);
            this.emit('reset-timer');
        });

        return { skipItem: skipItem, resetItem: resetItem };
    }

    _makeResetAllSubmenu() {
        // Confirmation submenu to prevent accidental loss of completed counts.
        let submenu = new PopupMenu.PopupSubMenuMenuItem(_("Reset all"));
        let confirm = new PopupMenu.PopupMenuItem(_("Confirm reset of everything"));
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

    _buildHotkeyHint() {
        this._hotkeyItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        this._hotkeyLabel = new St.Label({
            text: "",
            style_class: "pomodoro-hotkey"
        });
        this._hotkeyItem.addActor(this._hotkeyLabel);
        if (this._hotkeyItem.actor) {
            this._hotkeyItem.actor.hide();
        }
        this.addMenuItem(this._hotkeyItem);
    }

    _buildIdleLayout() {
        this._buildStatusHeader();

        // @PUBLIC_STRIP_BEGIN
        let sitesRow = this._makeInfoRow(_("Sites"), _("ready"));
        this._sitesLabel = sitesRow.value;
        this.addMenuItem(sitesRow.item);
        // @PUBLIC_STRIP_END

        this._buildHotkeyHint();

        this._buildPrimaryAction();

        this._chooseTaskItem = new PopupMenu.PopupMenuItem(_("Task\u2026"));
        this._chooseTaskItem.connect('activate', () => {
            this.emit('choose-task');
        });
        this.addMenuItem(this._chooseTaskItem);

        this._focusUntilItem = new PopupMenu.PopupMenuItem(_("Focus until\u2026"));
        this._focusUntilItem.connect('activate', () => {
            this.emit('focus-until');
        });
        this.addMenuItem(this._focusUntilItem);

        this._zenItem = new PopupMenu.PopupMenuItem(_("Zen mode"));
        this._zenItem.connect('activate', () => {
            this.emit('toggle-zen');
        });
        this.addMenuItem(this._zenItem);

        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Presets collapsed into a submenu to reduce idle clutter.
        this._presetSubmenu = new PopupMenu.PopupSubMenuMenuItem(_("Preset"));
        this.addMenuItem(this._presetSubmenu);
        this._populatePresetSubmenu();

        this._tasksSubmenu = new PopupMenu.PopupSubMenuMenuItem(_("Tasks"));
        this.addMenuItem(this._tasksSubmenu);
        this._populateTasksSubmenu();

        this._statsSubmenu = new PopupMenu.PopupSubMenuMenuItem(_("Statistics"));
        let dashItem = new PopupMenu.PopupMenuItem("\ud83d\udcca " + _("Open dashboard\u2026"));
        dashItem.connect('activate', () => { this.emit('open-stats'); });
        this._statsSubmenu.menu.addMenuItem(dashItem);
        this._statTodayItem = new PopupMenu.PopupMenuItem(_("Today: %d").format(0));
        this._statTodayItem.setSensitive(false);
        this._statsSubmenu.menu.addMenuItem(this._statTodayItem);
        this._statWeekItem = new PopupMenu.PopupMenuItem(_("Last 7 days: %d").format(0));
        this._statWeekItem.setSensitive(false);
        this._statsSubmenu.menu.addMenuItem(this._statWeekItem);
        this._statMonthItem = new PopupMenu.PopupMenuItem(_("Last 30 days: %d").format(0));
        this._statMonthItem.setSensitive(false);
        this._statsSubmenu.menu.addMenuItem(this._statMonthItem);
        this._statTotalItem = new PopupMenu.PopupMenuItem(_("All time: %d").format(0));
        this._statTotalItem.setSensitive(false);
        this._statsSubmenu.menu.addMenuItem(this._statTotalItem);
        this._statTimeItem = new PopupMenu.PopupMenuItem(_("Focus time: %s today · %s total").format(this._fmtDuration(0), this._fmtDuration(0)));
        this._statTimeItem.setSensitive(false);
        this._statsSubmenu.menu.addMenuItem(this._statTimeItem);
        this._statStreakItem = new PopupMenu.PopupMenuItem(_("Streak: %d days (best %d)").format(0, 0));
        this._statStreakItem.setSensitive(false);
        this._statsSubmenu.menu.addMenuItem(this._statStreakItem);
        this._statBestItem = new PopupMenu.PopupMenuItem(_("Best day: %d").format(0));
        this._statBestItem.setSensitive(false);
        this._statsSubmenu.menu.addMenuItem(this._statBestItem);
        this._statAchieveItem = new PopupMenu.PopupMenuItem(_("Milestones: %s").format(_("none yet")));
        this._statAchieveItem.setSensitive(false);
        this._statsSubmenu.menu.addMenuItem(this._statAchieveItem);
        try {
            let chartItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
            this._statsChart = new St.DrawingArea({ x_expand: true, style: "height: 64px; margin: 2px 6px 4px 6px;" });
            this._statsChart.connect('repaint', (area) => this._repaintStatsHeatmap(area));
            chartItem.addActor(this._statsChart);
            this._statsSubmenu.menu.addMenuItem(chartItem);
        } catch (e) {
            global.logError("Zen Pomodoro: stats chart unavailable: " + e.message);
        }
        this.addMenuItem(this._statsSubmenu);

        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.addMenuItem(this._makeSectionLabel(_("SESSION")));

        let sr = this._makeSkipResetItems();
        this.addMenuItem(sr.skipItem);
        this.addMenuItem(sr.resetItem);
        this.addMenuItem(this._makeResetAllSubmenu());
    }

    _buildActiveLayout() {
        this._buildStatusHeader();

        // @PUBLIC_STRIP_BEGIN
        let compact = this._makeCompactInfoRow(this._presetState.activePreset || "unknown", false);
        // @PUBLIC_STRIP_ELSE
        // let compact = this._makeCompactInfoRow(this._presetState.activePreset || "unknown");
        // @PUBLIC_STRIP_END
        this._compactInfoLabel = compact.label;
        this.addMenuItem(compact.item);

        this._buildPrimaryAction();

        this._sessionSubmenu = new PopupMenu.PopupSubMenuMenuItem(_("Session\u2026"));
        let sr = this._makeSkipResetItems();
        this._sessionSubmenu.menu.addMenuItem(sr.skipItem);
        this._sessionSubmenu.menu.addMenuItem(sr.resetItem);
        this._sessionSubmenu.menu.addMenuItem(this._makeResetAllSubmenu());
        this.addMenuItem(this._sessionSubmenu);
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
                if (runtime.streak && runtime.streak > 0) {
                    text += "   \u{1F525}" + runtime.streak;
                }
                this._dailyLabel.set_text(text);
                this._dailyLabel.show();
            } else {
                this._dailyLabel.hide();
            }
        }

        if (this._statsSubmenu && runtime.stats) {
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
            if (this._statsChart && Array.isArray(st.heatmap)) {
                this._statsHeatmap = st.heatmap;
                this._statsChart.queue_repaint();
            }
        }

        let badge = runtime.stateLabel || "Ready";
        if (badge === "Ready") {
            badge = "READY";
        }

        if (this._progressLabel) {
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
                if (runtime.endTime) {
                    line += ` \u00B7 ` + _("until %s").format(runtime.endTime);
                }
                this._progressLabel.set_text(line);
            } else {
                this._progressLabel.set_text(state === "break-over" ? _("Break finished — press Start for focus") : _("%d min focus — press Start").format(runtime.focusMinutes || 25));
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
            this._timeLeftLabel.set_text(timeLeft || "--:--");
            this._timeLeftLabel.set_style_class_name(isIdle ? "pomodoro-time pomodoro-time-idle" : "pomodoro-time");
        }

        if (this._taskLabel) {
            if (task) {
                this._taskLabel.set_text(_("Task: %s").format(task));
            } else if (selectedTask && isIdle) {
                this._taskLabel.set_text(_("Task: %s").format(selectedTask));
            } else if (state === "pomodoro-stop") {
                this._taskLabel.set_text(_("Task will be selected on start"));
            } else {
                this._taskLabel.set_text(_("Task: none"));
            }
        }

        // @PUBLIC_STRIP_BEGIN
        let sitesText = runtime.focusBlockActive ? _("blocked") : _("ready");
        if (typeof runtime.blockedSitesCount === "number" && runtime.blockedSitesCount > 0) {
            sitesText += ` (${runtime.blockedSitesCount})`;
        }
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

        // Hotkey hint (idle only; shown when a hotkey is configured).
        if (this._hotkeyItem && this._hotkeyLabel) {
            let hk = this._prettyHotkey(runtime.hotkey);
            if (hk) {
                this._hotkeyLabel.set_text(_("Hotkey: %s").format(hk));
                if (this._hotkeyItem.actor) {
                    this._hotkeyItem.actor.show();
                }
            } else if (this._hotkeyItem.actor) {
                this._hotkeyItem.actor.hide();
            }
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
            if (runtime.timerPaused) {
                let resumeLabel = (state === "short-break-paused" || state === "long-break-paused")
                    ? _("Resume break") : _("Resume focus");
                this._primaryActionItem.setLabel(resumeLabel);
                this._primaryActionItem.setOrnament(PopupMenu.OrnamentType.NONE);
                this._primaryActionMode = "resume";
            } else if (runtime.timerRunning) {
                this._primaryActionItem.setLabel(state === "pomodoro" ? _("Pause focus") : _("Pause break"));
                this._primaryActionItem.setOrnament(PopupMenu.OrnamentType.CHECK, true);
                this._primaryActionMode = "pause";
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
            this._skipTimerItem.setSensitive(Boolean(runtime.timerRunning || runtime.timerPaused));
        }
        if (this._resetTimerItem) {
            this._resetTimerItem.setSensitive(state !== "pomodoro-stop" || Boolean(runtime.timerRunning || runtime.timerPaused));
        }
    }

    _prettyHotkey(hk) {
        if (!hk || typeof hk !== "string") {
            return "";
        }

        let first = hk.split("::")[0].trim();
        if (!first) {
            return "";
        }

        return first.replace(/</g, "").replace(/>/g, "+");
    }

    setTasks(list, currentId, finishText, templates) {
        this._tasks = Array.isArray(list) ? list : [];
        this._tasksCurrentId = currentId || "";
        this._tasksFinishText = finishText || "";
        this._taskTemplates = Array.isArray(templates) ? templates : [];
        this._populateTasksSubmenu();
        if (this._tasksSubmenu && this._tasksSubmenu.label) {
            let cur = this._tasks.find((t) => t.id === this._tasksCurrentId);
            this._tasksSubmenu.label.set_text(_("Tasks") + (cur ? (": " + cur.title) : ""));
        }
    }

    _populateTasksSubmenu() {
        if (!this._tasksSubmenu) {
            return;
        }
        this._tasksSubmenu.menu.removeAll();
        this._taskItems = [];
        let add = new PopupMenu.PopupMenuItem("\u2795 " + _("Add task\u2026"));
        add.connect('activate', () => this.emit('add-task'));
        this._tasksSubmenu.menu.addMenuItem(add);
        if (this._tasksFinishText) {
            let fin = new PopupMenu.PopupMenuItem(this._tasksFinishText);
            fin.setSensitive(false);
            this._tasksSubmenu.menu.addMenuItem(fin);
        }
        let list = this._tasks || [];
        if (list.length) {
            this._tasksSubmenu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
        for (let task of list) {
            let t = task;
            let label = t.title + "   " + (t.doneToday || 0) + "/" + (t.est || 1) + " \ud83c\udf45";
            let item = new PopupMenu.PopupMenuItem(label);
            if (t.completed) {
                item.setOrnament(PopupMenu.OrnamentType.CHECK, true);
            } else {
                item.setOrnament(PopupMenu.OrnamentType.DOT, t.id === this._tasksCurrentId);
            }
            item.connect('activate', () => this.emit('select-task', t.id));
            this._tasksSubmenu.menu.addMenuItem(item);
            this._taskItems.push({ item: item, task: t });
        }
        if (list.length) {
            this._tasksSubmenu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            let done = new PopupMenu.PopupMenuItem("\u2713 " + _("Toggle done (current)"));
            done.connect('activate', () => this.emit('toggle-task-done'));
            this._tasksSubmenu.menu.addMenuItem(done);
            let del = new PopupMenu.PopupMenuItem("\ud83d\uddd1 " + _("Delete current"));
            del.connect('activate', () => this.emit('delete-task'));
            this._tasksSubmenu.menu.addMenuItem(del);
        }
        let templates = this._taskTemplates || [];
        if (list.length || templates.length) {
            this._tasksSubmenu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
        if (list.length) {
            let save = new PopupMenu.PopupMenuItem("\ud83d\udcbe " + _("Save as template\u2026"));
            save.connect('activate', () => this.emit('save-template'));
            this._tasksSubmenu.menu.addMenuItem(save);
        }
        for (let tpl of templates) {
            let nm = tpl.name;
            let it = new PopupMenu.PopupMenuItem("\ud83d\udccb " + _("Apply: %s").format(nm));
            it.connect('activate', () => this.emit('apply-template', nm));
            this._tasksSubmenu.menu.addMenuItem(it);
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
            let blocked = Boolean(this._lastRuntimeState.focusBlockActive);
            let t = blocked ? _("blocked") : _("ready");
            if (typeof this._lastRuntimeState.blockedSitesCount === "number" && this._lastRuntimeState.blockedSitesCount > 0) {
                t += ` (${this._lastRuntimeState.blockedSitesCount})`;
            }
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
