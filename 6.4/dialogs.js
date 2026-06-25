const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const GObject = imports.gi.GObject;
const ModalDialog = imports.ui.modalDialog;
const Dialog = imports.ui.dialog;
const CinnamonEntry = imports.ui.cinnamonEntry;
const GLib = imports.gi.GLib;
const Gettext = imports.gettext;

const UUID = "zen-pomodoro@vtestah";
Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

function _(str) {
    return Gettext.dgettext(UUID, str);
}

var PomodoroFocusTaskDialog = GObject.registerClass({
    GTypeName: `pomodoro_applet_PomodoroFocusTaskDialog_${Date.now()}`,
    Signals: {
        'focus-task-confirmed': { param_types: [GObject.TYPE_STRING] },
        'focus-task-cancelled': {}
    }
}, class PomodoroFocusTaskDialog extends ModalDialog.ModalDialog {
    _init() {
        super._init({destroyOnClose: false});

        let content = new Dialog.MessageDialogContent({
            title: _("Focus task"),
            description: _("What are you focusing on?")
        });

        this._entry = new St.Entry({ style_class: 'run-dialog-entry', can_focus: true });
        this._entryHint = new St.Label({ text: _("e.g. Write the report") });
        this._entry.set_hint_actor(this._entryHint);
        CinnamonEntry.addContextMenu(this._entry);
        this._entryText = this._entry.clutter_text;
        content.add_child(this._entry);

        this._hintLabel = new St.Label({
            text: _("Choose or type a focus task"),
            style: 'color: rgba(255, 190, 64, 0.95); padding-top: 6px;'
        });
        this._hintLabel.hide();
        content.add_child(this._hintLabel);

        this._taskListBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style: 'spacing: 4px; padding-top: 8px;'
        });
        content.add_child(this._taskListBox);

        this._content = content;
        this.contentLayout.add(content);
        this.setInitialKeyFocus(this._entryText);

        this._entryText.connect('key-press-event', (_actor, event) => {
            let symbol = event.get_key_symbol();
            if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter) {
                this._confirm();
                return true;
            }
            return false;
        });

        this._setDialogButtons(_("Start"));

        // run-dialog-entry is tuned for Cinnamon's always-dark run dialog (light
        // text); on a light theme that text is invisible, so recolour the entry
        // and hint from the dialog's own theme foreground when it opens.
        this.connect('opened', () => this._applyEntryTheme());
    }

    _applyEntryTheme() {
        if (!this._content) { return; }
        try {
            let c = this._content.get_theme_node().get_foreground_color();
            if (this._entryHint) {
                // Placeholder: a dim version of the theme's own text colour, so it
                // reads on both light and dark dialogs (run-dialog-entry's built-in
                // hint is tuned for the always-dark run dialog).
                this._entryHint.set_style("color: rgba(" + c.red + ", " + c.green + ", " + c.blue + ", 0.6);");
            }
            let lum = (0.2126 * c.red + 0.7152 * c.green + 0.0722 * c.blue) / 255;
            if (this._hintLabel) {
                let hint = (lum < 0.5) ? "rgb(150, 92, 8)" : "rgba(255, 190, 64, 0.95)";
                this._hintLabel.set_style("color: " + hint + "; padding-top: 6px;");
            }
        } catch (e) {}
    }

    _setDialogButtons(confirmLabel) {
        this.setButtons([
            { label: _("Cancel"), action: () => { this._cancel(); }, key: Clutter.KEY_Escape },
            { label: confirmLabel, action: () => { this._confirm(); }, default: true }
        ]);
    }

    _applyMode(selectOnly, running) {
        if (this._content) {
            this._content.title = selectOnly ? _("Current task") : _("Focus task");
            this._content.description = selectOnly ? _("Choose a task to focus on") : _("What are you focusing on?");
        }
        this._setDialogButtons(selectOnly ? (running ? _("Switch") : _("Select")) : _("Start"));
    }

    setTaskList(tasks, currentTitle, requireTask, selectOnly, running) {
        this._taskItems = Array.isArray(tasks) ? tasks : [];
        this._currentTitle = currentTitle || "";
        this._requireTask = Boolean(requireTask);
        this._applyMode(Boolean(selectOnly), Boolean(running));
        this._reloadTaskList();
        this._hideTaskRequiredHint();
        this._entryText.set_text("");
    }

    _reloadTaskList() {
        if (!this._taskListBox) { return; }
        for (let child of this._taskListBox.get_children()) { child.destroy(); }
        let tasks = Array.isArray(this._taskItems) ? this._taskItems : [];
        let active = tasks.filter((t) => !t.completed);
        if (!active.length) { this._taskListBox.hide(); return; }
        this._taskListBox.show();
        for (let t of active) {
            let mark = (t.title === this._currentTitle) ? "\u25cf " : "";
            let dt = t.doneToday || 0;
            let prog = (t.est > 0) ? (dt + "/" + t.est + " \ud83c\udf45") : (dt > 0 ? (dt + " \ud83c\udf45") : "");
            let rhythm = (t.preset && t.preset.name) ? ("  \u00b7 " + t.preset.name) : "";
            let label = mark + t.title + (prog ? "   " + prog : "") + rhythm;
            let button = new St.Button({
                style_class: 'dialog-button',
                label: this._clipLabel(label),
                can_focus: true, x_expand: true, reactive: true
            });
            let title = t.title;
            button.connect('clicked', () => { this.close(); this.emit('focus-task-confirmed', title); });
            this._taskListBox.add_child(button);
        }
    }

    _isTaskRequired() {
        return Boolean(this._requireTask);
    }

    _showTaskRequiredHint() {
        if (this._hintLabel) { this._hintLabel.show(); }
        this.setInitialKeyFocus(this._entryText);
        this._entryText.grab_key_focus();
    }

    _hideTaskRequiredHint() {
        if (this._hintLabel) { this._hintLabel.hide(); }
    }

    _clipLabel(task) {
        let maxLength = 48;
        if (task.length <= maxLength) {
            return task;
        }

        return `${task.slice(0, maxLength - 3)}...`;
    }

    _getTask() {
        return this._entryText.get_text().replace(/\s+/g, " ").trim();
    }

    _confirm() {
        let task = this._getTask();
        if (!task) { task = this._currentTitle || ""; }
        if (!task && this._isTaskRequired()) {
            this._showTaskRequiredHint();
            return;
        }

        this.close();
        this.emit('focus-task-confirmed', task);
    }

    _cancel() {
        this.close();
        this.emit('focus-task-cancelled');
    }
});

var PomodoroSetFinishedDialog = GObject.registerClass({
    // The GTypeName must be unique, so we use the current timestamp here to avoid
    // exceptions at runtime when reloading the applet.
    GTypeName: `pomodoro_applet_PomodoroSetFinishedDialog_${Date.now()}`,
    Signals: {
        'switch-off-pomodoro': {},
        'start-new-pomodoro': {},
        'hide-pomodoro-modal': {}
    }
}, class PomodoroSetFinishedDialog extends ModalDialog.ModalDialog {
    _init() {
        super._init({destroyOnClose: false});

        this._content = new Dialog.MessageDialogContent();
        this.contentLayout.add(this._content);

        this.setButtons([
            {
                label: _("Hide"),
                action: () => {
                    this.emit('hide-pomodoro-modal');
                },
                key: Clutter.KEY_Escape,
            },
            {
                label: _("Switch Off Pomodoro"),
                action: () => {
                    this.emit('switch-off-pomodoro');
                }
            },
            {
                label: _("Start a new Pomodoro"),
                action: () => {
                    this.emit('start-new-pomodoro');
                }
            },
        ]);

        this.setDefaultLabels();
    }

    setDefaultLabels() {
        this._content.title = _("Pomodoro set finished, you deserve a break!") + "\n";
        // Reset the time label text
        this._content.description = '';
    }

    setTimeRemaining(timer) {
        let tickCount = timer.getTicksRemaining();

        if (tickCount === 0) {
            this._content.title = _("Your break is over, start another pomodoro!") + "\n";
            this._content.description = '';
            return;
        }

        // Update the time label text based on the time remaining
        this._setTimeLabelText(_("A new pomodoro begins in %s.").format(this._getTimeString(tickCount)));
    }

    _setTimeLabelText(label) {
        this._content.description = label + "\n";
    }

    _getTimeString(totalSeconds) {
        // Convert total seconds to minutes and seconds
        let minutes = parseInt(totalSeconds / 60);
        let seconds = parseInt(totalSeconds % 60);

        let min = Gettext.dngettext(UUID, "%d minute", "%d minutes", minutes).format(minutes);
        let sec = Gettext.dngettext(UUID, "%d second", "%d seconds", seconds).format(seconds);

        return _("%s and %s").format(min, sec);
    }
});

var PomodoroShortBreakFinishedDialog = GObject.registerClass({
    // The GTypeName must be unique, so we use the current timestamp here to avoid
    // exceptions at runtime when reloading the applet.
    GTypeName: `pomodoro_applet_PomodoroShortBreakFinishedDialog_${Date.now()}`,
    Signals: {
        'continue-current-pomodoro': {},
        'pause-pomodoro': {},
    }
}, class PomodoroShortBreakFinishedDialog extends ModalDialog.ModalDialog {
    _init() {
        super._init({destroyOnClose: false});

        this._content = new Dialog.MessageDialogContent();
        this.contentLayout.add(this._content);

        this.setButtons([
            {
                label: _("Pause Pomodoro"),
                action: () => {
                    this.emit('pause-pomodoro');
                }
            },
            {
                label: _("Continue Current Pomodoro"),
                default: true,
                action: () => {
                    this.emit('continue-current-pomodoro');
                }
            },
        ]);

        this.setDefaultLabels();
    }

    setDefaultLabels() {
        this._content.title = _("Short break finished, ready to continue?") + "\n";
        this._content.description = '';
    }
});

var PomodoroFinishedDialog = GObject.registerClass({
    // The GTypeName must be unique, so we use the current timestamp here to avoid
    // exceptions at runtime when reloading the applet.
    GTypeName: `pomodoro_applet_PomodoroFinishedDialog_${Date.now()}`,
    Signals: {
        'continue-current-pomodoro': {},
        'pause-pomodoro': {},
        'extend-pomodoro': {},
    }
}, class PomodoroFinishedDialog extends ModalDialog.ModalDialog {
    _init() {
        super._init({destroyOnClose: false});

        this._content = new Dialog.MessageDialogContent();
        this.contentLayout.add(this._content);

        this._extendMinutes = 0;
        this._buildButtons();
        this.setDefaultLabels();
    }

    setExtend(minutes) {
        this._extendMinutes = (typeof minutes === "number" && minutes > 0) ? minutes : 0;
        this._buildButtons();
    }

    _buildButtons() {
        let buttons = [
            {
                label: _("Pause Pomodoro"),
                action: () => {
                    this.emit('pause-pomodoro');
                }
            },
        ];
        if (this._extendMinutes > 0) {
            buttons.push({
                label: _("Extend +%d min").format(this._extendMinutes),
                action: () => {
                    this.emit('extend-pomodoro');
                }
            });
        }
        buttons.push({
            label: _("Start break"),
            default: true,
            action: () => {
                this.emit('continue-current-pomodoro');
            }
        });
        this.setButtons(buttons);
    }

    setDefaultLabels() {
        this._content.title = _("Pomodoro finished, ready to take a break?") + "\n";
        this._content.description = '';
    }

    setTip(text) {
        this._content.description = text ? (text + "\n") : '';
    }
});
