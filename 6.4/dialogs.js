const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const GObject = imports.gi.GObject;
const ModalDialog = imports.ui.modalDialog;
const Dialog = imports.ui.dialog;
const DND = imports.ui.dnd;
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
        this._entry.clutter_text.connect('key-focus-in', () => this._entryHint.hide());
        this._entry.clutter_text.connect('key-focus-out', () => { if (!this._entry.get_text()) { this._entryHint.show(); } });
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

        // Softer than a hard modal: a click outside the dialog box cancels it
        // (Esc and Cancel still work). Clicks inside the box are left alone.
        if (this._eventBlocker) {
            this._eventBlocker.connect('button-press-event', (actor, event) => {
                try {
                    let [x, y] = event.get_coords();
                    let [bx, by] = this.dialogLayout.get_transformed_position();
                    let [bw, bh] = this.dialogLayout.get_size();
                    if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
                        return Clutter.EVENT_PROPAGATE;
                    }
                } catch (e) {}
                this._cancel();
                return Clutter.EVENT_STOP;
            });
        }
    }

    _applyEntryTheme() {
        if (!this._content) { return; }
        try {
            let c = this._content.get_theme_node().get_foreground_color();
            if (this._entryHint && this._entry) {
                // Placeholder sits inside the entry (which can have its own, e.g.
                // white, background), so dim the entry's text colour — not the
                // dialog's — or it washes out on a light entry.
                let ec = this._entry.get_theme_node().get_foreground_color();
                this._entryHint.set_style("color: rgba(" + ec.red + ", " + ec.green + ", " + ec.blue + ", 0.55);");
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
            let selected = (t.title === this._currentTitle);
            let dt = t.doneToday || 0;
            let prog = (t.est > 0) ? (dt + "/" + t.est + " \ud83c\udf45") : (dt > 0 ? (dt + " \ud83c\udf45") : "");

            // Columns: title left (fills), preset dim, 🍅 count right-aligned in a
            // fixed slot so the counts line up instead of stair-stepping.
            let row = new St.BoxLayout({ vertical: false, x_expand: true, style: 'spacing: 8px;' });
            let titleLab = new St.Label({
                text: this._clipLabel(t.title), x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
                style: selected ? 'font-weight: bold;' : ''
            });
            row.add_child(titleLab);
            if (t.preset && t.preset.name) {
                let presetLab = new St.Label({ text: t.preset.name, y_align: Clutter.ActorAlign.CENTER });
                presetLab.set_opacity(140);
                row.add_child(presetLab);
            }
            let progLab = new St.Label({
                text: prog, y_align: Clutter.ActorAlign.CENTER,
                style: 'min-width: 64px; text-align: right;'
            });
            row.add_child(progLab);

            let button = new St.Button({
                style_class: 'dialog-button', can_focus: true, x_expand: true, reactive: true, child: row,
                style: selected ? 'background-color: rgba(227, 90, 60, 0.16); border-radius: 6px;' : ''
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

// A modal dialog that lists items as draggable rows; dragging reorders them,
// and "Done" reports the new order. Reused for tasks and presets.
var PomodoroReorderDialog = GObject.registerClass({
    GTypeName: `pomodoro_applet_PomodoroReorderDialog_${Date.now()}`,
}, class PomodoroReorderDialog extends ModalDialog.ModalDialog {
    _init() {
        super._init({ destroyOnClose: false });
        this._onApply = null;

        this._content = new Dialog.MessageDialogContent({
            title: _("Reorder"),
            description: _("Drag the rows to reorder, then press Done.")
        });
        this.contentLayout.add(this._content);

        this._listBox = new St.BoxLayout({
            vertical: true, x_expand: true,
            style: 'spacing: 4px; padding-top: 10px; min-width: 380px;'
        });
        this.contentLayout.add(this._listBox);

        let self = this;
        // The list is the drop target: on drag-over / drop we move the dragged
        // row live to the slot under the pointer (the order lives in the children).
        this._listBox._delegate = {
            handleDragOver: function (source, actor, x, y, time) {
                self._moveRowTo(source, y);
                return DND.DragMotionResult.MOVE_DROP;
            },
            acceptDrop: function (source, actor, x, y, time) {
                self._moveRowTo(source, y);
                return true;
            }
        };

        this.setButtons([
            { label: _("Cancel"), key: Clutter.KEY_Escape, action: () => this.close() },
            { label: _("Done"), default: true, action: () => this._apply() }
        ]);
    }

    // items: [{ key, label }]; onApply(orderedKeys) is called on Done.
    openReorder(title, items, onApply) {
        this._onApply = onApply;
        if (this._content) { this._content.title = title || _("Reorder"); }
        this._buildRows(Array.isArray(items) ? items : []);
        this.open();
    }

    _buildRows(items) {
        for (let c of this._listBox.get_children()) { c.destroy(); }
        for (let it of items) {
            let row = new St.BoxLayout({
                vertical: false, reactive: true, x_expand: true,
                style: 'spacing: 8px; padding: 7px 10px; border-radius: 6px;'
            });
            let handle = new St.Label({ text: "\u2261", y_align: Clutter.ActorAlign.CENTER });
            handle.set_opacity(150);
            row.add_child(handle);
            let lab = new St.Label({ text: it.label, x_expand: true, y_align: Clutter.ActorAlign.CENTER });
            row.add_child(lab);
            row._reorderKey = it.key;
            let label = it.label;
            row._delegate = {
                _key: it.key,
                getDragActor: function () {
                    return new St.Label({
                        text: label,
                        style: 'background-color: rgba(227, 90, 60, 0.92); color: #ffffff; padding: 7px 12px; border-radius: 6px;'
                    });
                },
                getDragActorSource: function () { return row; }
            };
            row._draggable = DND.makeDraggable(row);
            row._draggable.connect('drag-begin', () => { row.set_opacity(45); });
            row._draggable.connect('drag-end', () => { row.set_opacity(255); });
            row._draggable.connect('drag-cancelled', () => { row.set_opacity(255); });
            this._listBox.add_child(row);
        }
    }

    // Move the dragged row to the slot under pointer-y (list-local coordinates).
    _moveRowTo(source, y) {
        if (!source || typeof source.getDragActorSource !== 'function') { return; }
        let row = source.getDragActorSource();
        let children = this._listBox.get_children();
        if (children.indexOf(row) < 0) { return; }
        let idx = 0;
        for (let c of children) {
            if (c === row) { continue; }
            if (c.y + c.height / 2 < y) { idx++; } else { break; }
        }
        if (children.indexOf(row) !== idx) {
            this._listBox.set_child_at_index(row, idx);
        }
    }

    _apply() {
        let order = this._listBox.get_children().map((c) => c._reorderKey);
        let cb = this._onApply;
        this.close();
        if (typeof cb === 'function') { try { cb(order); } catch (e) {} }
    }
});
