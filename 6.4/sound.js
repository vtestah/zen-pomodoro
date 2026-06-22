const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

/*
 * Sound backend.
 *
 * Playback prefers GSound (a GObject-introspected, asynchronous, cancellable
 * native API). GSound on libcanberra/PulseAudio does not reliably accept a
 * per-sound volume attribute, so when the user lowers a volume we fall back to
 * a managed Gio.Subprocess running a player that does support volume
 * (paplay -> canberra-gtk-play -> play). Nothing uses a shell, kill, or sox as
 * a hard dependency, and looping is stopped cleanly via Gio.Cancellable /
 * Gio.Subprocess.force_exit() rather than signalling a PID.
 */

let GSound = null;
try {
    GSound = imports.gi.GSound;
} catch (e) {
    GSound = null;
}

const PREVIEW_MS = 2000;
const FULL_VOLUME = 0.999;

let _gsoundContext;   // undefined = not initialised yet, null = unavailable

function _getGSoundContext() {
    if (_gsoundContext !== undefined) {
        return _gsoundContext;
    }
    _gsoundContext = null;
    if (GSound) {
        try {
            let ctx = new GSound.Context();
            ctx.init(null);
            _gsoundContext = ctx;
        } catch (e) {
            global.logError("Zen Pomodoro: GSound init failed, will use a fallback player: " + e.message);
            _gsoundContext = null;
        }
    }
    return _gsoundContext;
}

// Players that are commonly preinstalled on Cinnamon/Mint, in order of preference.
const _PLAYERS = ["paplay", "canberra-gtk-play", "play"];
let _resolvedPlayer;  // undefined = not resolved yet, null = none available

function _getPlayer() {
    if (_resolvedPlayer !== undefined) {
        return _resolvedPlayer;
    }
    _resolvedPlayer = null;
    for (let p of _PLAYERS) {
        if (GLib.find_program_in_path(p)) {
            _resolvedPlayer = p;
            break;
        }
    }
    return _resolvedPlayer;
}

// Build a player argv. volume is a linear gain in [0, 1].
function _buildPlayerArgv(player, soundPath, volume) {
    if (player === "paplay") {
        let v = Math.max(0, Math.min(65536, Math.round(volume * 65536)));
        return ["paplay", "--volume=" + v, soundPath];
    }
    if (player === "play") {
        return ["play", "-q", "--volume", volume.toFixed(2), soundPath];
    }
    // canberra-gtk-play has no per-invocation volume control.
    return ["canberra-gtk-play", "-f", soundPath];
}

function addPathIfRelative(soundPath, basePath) {
    if (soundPath.startsWith('file://')) {
        soundPath = soundPath.substring(7);
    }
    if (soundPath.startsWith('/')) {
        return soundPath;
    }
    let fullPath = basePath ? `${basePath}/` : '';
    fullPath += soundPath;
    return fullPath;
}

// True if any backend (GSound or a fallback player) is available.
function isPlayable() {
    return _getGSoundContext() !== null || _getPlayer() !== null;
}

var SoundEffect = class SoundEffect {
    constructor(soundPath) {
        this._soundPath = "";
        this._isPlayable = false;
        this._loop = false;
        this._cancellable = null;     // active GSound playback
        this._subprocess = null;      // active fallback playback
        this._previewTimeoutId = 0;
        this._generation = 0;         // invalidates stale async callbacks
        this.setSoundPath(soundPath);
    }

    setSoundPath(soundPath) {
        soundPath = soundPath || "";
        let exists = soundPath !== "" && GLib.file_test(soundPath, GLib.FileTest.EXISTS);
        if (soundPath !== "" && !exists) {
            global.logError(`Zen Pomodoro: sound file not found: ${soundPath}`);
        }
        this._soundPath = soundPath;
        this._isPlayable = Boolean(exists) && isPlayable();
    }

    getSoundPath() {
        return this._soundPath;
    }

    isPlaying() {
        return this._cancellable !== null || this._subprocess !== null;
    }

    /**
     * Plays the sound.
     * @param {Object} params - { preview:Boolean, volume:Number(0..1), loop:Boolean }
     * @returns {Boolean} whether playback was started.
     */
    play(params = {}) {
        let preview = params.preview === true;
        let loop = (params.loop === true) && !preview;
        let volume = (typeof params.volume === "number") ? params.volume : 1;
        volume = Math.max(0, Math.min(1, volume));

        if (!this._isPlayable) {
            return false;
        }

        this.stop();
        this._loop = loop;
        this._generation++;
        let myGen = this._generation;

        let ctx = _getGSoundContext();
        let player = _getPlayer();
        let started = false;

        // GSound cannot attenuate, so use it only at (near) full volume.
        if (ctx && (volume >= FULL_VOLUME || !player)) {
            started = this._playGSound(ctx, myGen);
        } else if (player) {
            started = this._playSubprocess(player, volume, myGen);
        } else if (ctx) {
            started = this._playGSound(ctx, myGen);
        }

        if (started && preview) {
            this._previewTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, PREVIEW_MS, () => {
                this._previewTimeoutId = 0;
                this.stop();
                return GLib.SOURCE_REMOVE;
            });
        }
        return started;
    }

    playOnce() {
        return this.play();
    }

    _playGSound(ctx, myGen) {
        let cancellable = new Gio.Cancellable();
        this._cancellable = cancellable;
        let attrs = {};
        attrs[GSound.ATTR_MEDIA_FILENAME] = this._soundPath;
        try {
            ctx.play_full(attrs, cancellable, (src, res) => {
                let finishedOk = false;
                try {
                    finishedOk = src.play_full_finish(res);
                } catch (e) {
                    if (this._cancellable === cancellable) {
                        this._cancellable = null;
                    }
                    return;
                }
                if (myGen !== this._generation || this._cancellable !== cancellable) {
                    return; // superseded or stopped
                }
                if (this._loop && finishedOk && !cancellable.is_cancelled()) {
                    this._playGSound(ctx, myGen);
                } else {
                    this._cancellable = null;
                }
            });
        } catch (e) {
            global.logError("Zen Pomodoro: GSound playback failed: " + e.message);
            this._cancellable = null;
            return false;
        }
        return true;
    }

    _playSubprocess(player, volume, myGen) {
        let argv = _buildPlayerArgv(player, this._soundPath, volume);
        let proc;
        try {
            proc = Gio.Subprocess.new(argv,
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);
        } catch (e) {
            global.logError("Zen Pomodoro: failed to start sound player: " + e.message);
            return false;
        }
        this._subprocess = proc;
        proc.wait_async(null, (p, res) => {
            try {
                p.wait_finish(res);
            } catch (e) {
                // ignore
            }
            if (myGen !== this._generation || this._subprocess !== proc) {
                return; // superseded or stopped
            }
            if (this._loop) {
                this._playSubprocess(player, volume, myGen);
            } else {
                this._subprocess = null;
            }
        });
        return true;
    }

    stop() {
        this._loop = false;
        this._generation++;
        if (this._previewTimeoutId) {
            GLib.source_remove(this._previewTimeoutId);
            this._previewTimeoutId = 0;
        }
        if (this._cancellable) {
            try {
                this._cancellable.cancel();
            } catch (e) {
                // ignore
            }
            this._cancellable = null;
        }
        if (this._subprocess) {
            try {
                this._subprocess.force_exit();
            } catch (e) {
                // ignore
            }
            this._subprocess = null;
        }
    }
};
