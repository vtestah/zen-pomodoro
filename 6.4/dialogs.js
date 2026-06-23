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
        CinnamonEntry.addContextMenu(this._entry);
        this._entryText = this._entry.clutter_text;
        content.add_child(this._entry);

        this._hintLabel = new St.Label({
            text: _("Choose or type a focus task"),
            style: 'color: rgba(255, 190, 64, 0.95); padding-top: 6px;'
        });
        this._hintLabel.hide();
        content.add_child(this._hintLabel);

        this._presetTaskBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style: 'spacing: 6px; padding-top: 8px;'
        });
        content.add_child(this._presetTaskBox);

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

        this.setButtons([
            {
                label: _("Cancel"),
                action: () => {
                    this._cancel();
                },
                key: Clutter.KEY_Escape,
            },
            {
                label: _("Start"),
                action: () => {
                    this._confirm();
                },
                default: true,
            },
        ]);
    }

    setDefaultTask(task, presets, requireTask) {
        this._presets = Array.isArray(presets) ? presets : [];
        this._requireTask = Boolean(requireTask);
        this._reloadPresetTasks();
        this._hideTaskRequiredHint();
        this._entryText.set_text(task || "");
        this._entryText.set_cursor_position(-1);
        this._entryText.set_selection(0, -1);
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

    _reloadPresetTasks() {
        if (!this._presetTaskBox) {
            return;
        }
        for (let child of this._presetTaskBox.get_children()) {
            child.destroy();
        }

        let tasks = Array.isArray(this._presets) ? this._presets : [];
        if (tasks.length === 0) {
            this._presetTaskBox.hide();
            return;
        }

        this._presetTaskBox.show();
        for (let task of tasks) {
            let button = new St.Button({
                style_class: 'dialog-button',
                label: this._getPresetButtonLabel(task),
                can_focus: true,
                x_expand: true,
                reactive: true
            });

            button.connect('clicked', () => {
                this._confirmPresetTask(task);
            });

            this._presetTaskBox.add_child(button);
        }
    }

    _getPresetButtonLabel(task) {
        let maxLength = 48;
        if (task.length <= maxLength) {
            return task;
        }

        return `${task.slice(0, maxLength - 3)}...`;
    }

    _getTask() {
        return this._entryText.get_text().replace(/\s+/g, " ").trim();
    }

    _confirmPresetTask(task) {
        this._entryText.set_text(task || "");
        this._confirm();
    }

    _confirm() {
        let task = this._getTask();
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
