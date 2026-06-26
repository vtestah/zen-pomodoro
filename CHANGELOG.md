# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com),
and the project follows [Semantic Versioning](https://semver.org).

## [1.1.0] - 2026-06-26

### Bug Fixes

- Drop the empty mini-heatmap from the Statistics submenu
- *(dashboard)* Remove empty bottom-left by rebalancing chart layout
- *(media)* Default pause_media to off so it is opt-in
- *(menu)* Wrap the empty task-list hint instead of widening the menu
- *(menu)* Align idle header full-width and hide redundant lines
- *(menu)* Widen the empty task-list hint so it wraps to two lines
- *(tasks)* Neutral default preset tasks for the public build
- *(settings)* Move Pushover to its own page so Advanced doesn't overflow
- *(sounds)* Listen buttons always visible, audition any sound
- *(settings)* Make Pushover key/token/message fields full-width
- *(blocking)* Accept pasted URLs in the hosts helper
- *(applet)* Theme-adaptive panel ring + live ambient volume
- *(settings)* Shorten over-wide help labels to fit the 800px window
- *(applet)* Adapt the panel focus/break cue to light themes
- *(tasks)* Unify the focus task with the task list
- *(sound)* Settings window crashed on null ambient-file value
- *(menu)* Header shows the list's current task on load
- *(menu)* Keep menu open on task-button clicks; scroll long task lists
- *(menu)* Task rows non-activatable so clicks keep the menu open
- *(menu)* Task actions keep the menu open (focus-out on rebuild)
- *(menu)* Open the edit dialog after the menu fully closes
- *(menu)* Edit via plain click so its dialog opens like Add
- *(tasks)* + button no longer reflows the estimate row
- *(tasks)* Focus-start picker honors the task's preset
- *(tasks)* Keep the rhythm on load + thematic stat polish
- *(blocking)* Abort hosts-helper on /etc/hosts read error
- *(menu)* Adapt timer, text and accents to light themes
- *(ui)* Adapt stats dashboard and dialog placeholders to light themes
- *(dialogs)* Adapt add-task Preset caption and estimate text to light themes
- *(menu)* Make the progress bar track visible on light themes
- *(blocking)* Apply/clear actions, re-apply on change, stale cleanup
- *(tasks)* Typed focus task is added with no estimate, not 1
- *(sounds)* Ambient toggle starts/stops instantly during focus
- *(ui)* Dim placeholders from the entry's own text colour
- *(ui)* Distraction menu stays open; placeholders hide on focus
- *(ui)* Distraction menu stays open; even button radius in add-task
- *(ui)* Stop the distraction menu closing on delete
- Tear down popover/dialog on removal; drop dead distraction code
- *(ui)* Preset dialog placeholder reads correctly and hides on focus
- *(zen)* Make Zen mode actually reachable
- Cancel startup timeouts on remove; drop dead handler; tooltip
- *(zen)* Also dim the compositor wallpaper for the desktop-dim option
- *(i18n)* Correct 7 mismatched fuzzy ru strings
- *(onboarding)* Make wizard options and review keyboard/AT-accessible

### Documentation

- Add CHANGELOG and release/contribution guide
- Rewrite repo README and refresh the Spices store README
- Add GPLv3 LICENSE and reword the gfreeau attribution
- Correct translation completeness note
- Point README badge and remote at the zen-pomodoro repo
- Add community health files (security, contributing, CoC, issue/PR templates) and .editorconfig
- Add end-user install section and release/license badges
- Add logo to README header
- Use a crisp vector logo (logo.svg) in the README
- Use plain punctuation in README (drop em dashes/fancy typography)
- Center the README header (logo, title, tagline, badges, hero)
- Add a divider between the README title and badges
- Drop the README header divider
- Refresh Spices screenshot with the real English menu UI
- Expand README features to cover all current functionality
- Add a Why Zen Pomodoro section to lead with the calm-design angle
- *(spices)* Refresh packaged store README (full features, Why, plain punctuation)

### Features

- Focus UX overhaul and quality-of-life improvements
- Menu quick-access, break extend, and configurable scroll
- Replace dashboard "Copy summary" with "Reset statistics"
- *(media)* Pause playing media on breaks and resume on focus
- *(media)* Enable pause_media by default
- *(panel)* Add custom icon option and dedupe symbolic icon
- *(sounds)* Preview selected sounds from settings
- *(blocking)* Built-in auto-block on focus without custom scripts
- *(sound)* Let users choose their own focus ambient sound
- *(menu)* Bigger time + cleaner stacked header
- *(menu)* Inline Statistics section instead of a submenu
- *(menu)* Match the mock — white bold time + leaner focus menu
- *(menu)* Tighter, more compact header
- *(tasks)* Per-task inline actions; drop duplicate templates
- *(tasks)* Estimate as a real target — hint at estimate + editable estimate
- *(tasks)* One task list everywhere — start picker shows the list
- *(tasks)* Context-aware focus dialog — Start / Select / Switch
- *(menu)* Smarter focus header — task progress, cleaner status, switchable
- *(menu)* Reorganize the idle menu — grouped, shorter, no truncation
- *(menu)* Hover tooltips on task buttons + task line
- *(tasks)* Optional estimates — default to no estimate
- *(tasks)* Make the estimate understandable — live time + clearer label
- *(tasks)* Task-title placeholder + a '+' button for estimates over 6
- *(tasks)* Switch the focus preset inside the task dialog
- *(tasks)* Show exact focus time in the estimate (drop the approx sign)
- *(tasks)* Per-task presets — tasks carry their own rhythm
- *(presets)* Manage presets from the menu (add/edit/delete)
- *(menu)* Daily-goal tomato progress bar
- *(menu)* Circular progress ring + warm section headers
- *(stats)* Hover tooltips + real dates on dashboard charts
- *(stats)* Axis labels on dashboard charts
- *(menu)* Ambient-sound toggle in the focus menu too
- Unify into one public build — public site blocking, no scripts
- *(menu)* Open blocking settings straight to the Advanced page
- *(menu)* Small UX touches for the idle menu
- *(commands)* Choose a script file for the focus/break-start hook
- *(commands)* Pass context to hook scripts + add a daily-goal hook
- *(blocking)* Add _blockingStatus() and centralize helper paths
- *(blocking)* Settings Apply/Clear/Check buttons + real menu status
- *(sounds)* Add CC0 white/pink/brown/rain/sea ambient loops
- *(sounds)* Ambient choice dropdown (noise/rain/sea/custom) + migration
- *(sounds)* Ambient preview button + reliable migration
- *(settings)* Remove Durations section; presets drive the rhythm
- *(onboarding)* Explain Pomodoro in the wizard + About entry
- *(dialogs)* Focus-task picker columns + highlight + click-out close
- *(tasks)* Celebrate meaningful task completion (off/subtle/confetti)
- *(tasks)* Add a Preview button for the completion celebration
- *(settings)* Ambient on the Sounds page; General page; Modes section
- *(tasks)* Drag-to-reorder tasks and presets in a dialog
- *(icon)* App icon matches the panel tomato
- *(tasks)* Capture distractions during focus + richer break tips
- *(tasks)* Redesign distraction capture — hotkey popover + inline menu
- *(tasks)* Keep distraction capture out of the way unless used
- *(blocking)* The toggle blocks/unblocks directly (no manual buttons)
- *(zen)* Switch toggle with visible state, Esc to exit, one-time intro
- *(zen)* Replace black overlay with a focus spotlight
- *(zen)* Make spotlight dim strength + desktop-dim configurable
- *(zen)* Per-monitor focus frame + smooth dim fade
- *(ui)* Clearer reset labels + tooltips
- *(stats)* Dashboard goal line, CVD heatmap, a11y & CSV export
- *(stats)* Clearer Copy/Export feedback (in-dialog status + path in notification)
- *(onboarding)* Adaptive setup wizard with review, undo and keyboard nav
- *(breaks)* Optional lock screen during breaks
- *(onboarding)* Show a keyboard-shortcut hint on wizard questions
- *(sounds)* Ambient sounds + break-lock refinements
- *(sounds)* Real CC0 sea/stream, level volumes, drop dead assets
- *(dialogs)* Type-to-filter and keyboard nav in the focus-task picker

### Miscellaneous

- *(i18n)* Translate the new UI strings to Russian
- Source version from metadata.json and reject forbidden Spices fields
- Add git-cliff config and one-command release script
- Enforce Conventional Commits with a commit-msg hook
- *(i18n)* Translate quick-access, break and scroll strings to Russian
- Stamp last-edited on release so the About date stays current
- *(i18n)* Translate reset-statistics strings to Russian
- *(i18n)* Sync all .po files with the current template
- *(i18n)* Translate uk, de, es, fr, it, pt, pt_BR, nl, pl
- *(i18n)* Translate ca, da, fi, sv, hu, hr, tr, vi, zh_CN, zh_TW
- *(i18n)* Translate pause_media setting into all 20 languages
- *(i18n)* Translate panel_icon_style into all 20 languages
- *(i18n)* Translate custom panel-icon strings into all 20 languages
- *(i18n)* Refresh panel-icon tooltip; retire colored-icon string
- *(i18n)* Retire the unused Hotkey string
- *(i18n)* Translate the clarified menu labels into all 20 languages
- *(i18n)* Translate the Push notifications page title
- *(i18n)* Translate the sound Listen button and tooltip
- Stop tracking Python __pycache__ artifacts
- *(i18n)* Translate the passwordless-blocking hint
- *(i18n)* Translate the reworded blocking toggle
- *(i18n)* Translate the shortened help labels
- *(i18n)* Translate the ambient sound-file strings
- *(tasks)* Remove the now-unused template methods
- Remove stale LOCAL_FORK.md
- *(i18n)* Warmer RU finish wording
- *(i18n)* Align break-dialog RU wording with the menu
- *(i18n)* Catalogs for blocking, sound, durations and about strings
- *(i18n)* Catalogs for the task-completion celebration
- *(i18n)* Reorder dialog strings
- *(i18n)* Distraction capture and break-tip strings
- *(i18n)* Drop obsolete distraction strings
- *(i18n)* Blocking toggle wording
- *(i18n)* Distraction Delete tooltip; drop obsolete strings
- *(i18n)* Zen mode switch tooltip, intro, and exit hint
- *(i18n)* Focus spotlight strings
- *(i18n)* Zen spotlight settings strings
- *(i18n)* Translate About Pomodoro dialog into all languages
- *(i18n)* Reset wording + stats dashboard strings (ru)
- *(i18n)* Complete de/fr/es/it/pt/nl catalogs
- *(i18n)* Complete pt_BR catalog
- *(i18n)* Translate break-lock strings (8 locales)
- Parse-check applet JS, validate config/catalogs, guard private remnants
- Add GJS-aware eslint config and npm lint/test scripts
- Add release workflow (build package + GitHub Release on version tag)
- *(i18n)* Translate wizard keyboard-shortcut hints (20 locales)
- *(tooling)* Add npm script wrappers (build, sounds:*, test:py/all)
- *(i18n)* Translate cleanup labels; restore lost translations

### Other

- *(menu)* Restore inter-line spacing

### Refactor

- *(settings)* One Panel icon dropdown instead of 3 toggles
- *(panel)* Drop the redundant colored icon option
- *(menu)* Cleaner uniform menu — no emoji, no hotkey row
- *(menu)* Clearer labels for confusing menu entries
- *(blocking)* Toggle arms blocking; drop redundant Block/Unblock buttons
- *(blocking)* Remove the unreliable Edit /etc/hosts button
- *(blocking)* Drop the passwordless-mode switch, always silent
- *(tasks)* Single task system — drop Settings task presets
- *(menu)* Drop the Focus length submenu (presets own session timing)
- *(blocking)* Drop dead code from the toggle redesign
- *(menu)* Remove dead unused layout helpers
- *(settings)* Move Keyboard shortcuts to the General page
- *(menu)* Remove dead CSS for deleted layout helpers
- *(settings)* Give Zen its own section on the Focus page
- *(stats)* Make chart digests screen-reader-only
- *(settings)* Drop glow-width + ritual-duration micro-tuning
- *(settings)* Make calm ending always-on, drop the toggle
- *(settings)* Always show Focus-until; clarify dialog label
- *(settings)* Simplify soft landing to a toggle + behavior
- *(settings)* Merge 3 auto-start toggles into one
- *(settings)* Pushover per-event sound/priority to 2 global

### Styling

- *(menu)* Accent pill on start action + drop redundant task name
- *(menu)* Revert start-action pill, keep clean accent text
- *(menu)* Revert progress ring back to flat linear bar
- *(menu)* Compact one-line stats, hidden when goal bar shows
- *(menu)* Drop Reset counters from the idle menu
- *(menu)* Collapse Statistics into one compact clickable row
- *(menu)* Drop section headers, group with separators + stats chevron
- *(menu)* Make Site blocking row consistent with Statistics
- *(menu)* Show the stats value only when earned
- *(menu)* Cleaner focus menu
- *(dialogs)* Add a guiding placeholder to the focus-task picker
- *(menu)* Remove the Statistics and Blocking row chevrons
- *(presets)* Center the value between the stepper +/- buttons
- *(panel)* Ring-only while running, a small dot when idle
- *(panel)* Tomato idle mark and tomato inside the running ring
- *(panel)* Flat tomato idle mark and an icon-only idle panel
- *(panel)* Widen the idle tomato so it reads less round
- *(panel)* Deepen the idle tomato red and brighten it on hover

### Testing

- Add pytest suite for hosts-helper and setup-passwordless with CI
- *(onboarding)* Rename auto_start_after_pomodoro_ends -> auto_start_next

## [1.0.0] - 2026-06-22

### Bug Fixes

- Make the dashboard useful (insight + when-you-focus) and fix overflow
- Reword preset_tasks tooltip that tripped the focus-start guard
- Clearer idle status — fix ambiguous 'Готово' and make the line informative
- Dashboard h-scroll, CSV discoverability, + weekly review & hour axis

### Documentation

- Rewrite redundant settings tooltips to be actually helpful
- Add helpful tooltips to all remaining settings (with ru)

### Features

- *(appearance)* Theme presets + custom accent colors, frame style (glow/border/corners/off), glow intensity & progress width
- *(appearance)* Reduce-motion gating, breathing patterns, chip position, ritual duration, menu font scale
- *(appearance)* Live preview buttons for focus frame and breathing guide
- *(settings)* Tabbed layout (Timer/Panel/Focus HUD/Appearance/Features/Sounds/Scripts) + RU titles
- Preset tasks as a public settings feature (list + require toggle); replaces file/config reads; build genericizes default
- Make Spices-ready + add safe public focus tools
- Add opt-in Pushover notifications and pkexec distraction blocking
- Add detailed history & statistics (Marinara-style)
- Add optional interval chime during focus
- Precise duration entry (spinbuttons) + ru 'minutes'
- Bundle ding/bell tones; default interval chime to ding
- 7-day bar chart in Statistics (visual history)
- Option to hide seconds in the panel timer
- Start/pause + skip hotkeys, and start-on-click
- Compact panel label in vertical panels
- Group configurable hotkeys under a 'Keyboard shortcuts' header
- Configurable Pushover title and messages
- Pushover on focus start + {task}/{minutes} placeholders
- Richer Pushover (sound, priority, HTML)
- Make enable_scripts the master switch for all personal-script use
- Richer statistics — focus time, records, 12-week heatmap
- Week-over-week trend + milestone badges in statistics
- User-defined timer presets (create, save, apply from menu)
- Statistics dashboard window (stat cards, 14-day bar chart, 12-week heatmap, milestones)
- Meaningful ready-state panel mark instead of an empty ring
- Render a little tomato in the ready-state panel mark
- Task list with pomodoro estimates + per-task progress (Tier 1.1)
- Estimate-to-finish + interruption tracking (Tier 1.3 + 2.4)
- Dashboard by-task breakdown, today's harvest, interruptions (Tier 1.2 + 2.4 + 3.6)
- Export statistics to CSV + JSON (Tier 2.5)
- Task templates — save/apply sets of tasks (Tier 3.7)
- Optional one-time passwordless distraction blocking
- More informative active status line (pomodoro position / break type)
- Brand-new vector tomato icon set (drop old raster icons)
- First-run quick-start wizard (7 steps, auto-launch + menu/settings entry)
- Show the tomato inside the progress ring during focus/break too
- Per-event Pushover messages (split short/long break + daily-goal hook)
- Wizard polish — tomato-dot progress header + Start first focus button
- Clear visual pause state on the panel (dimmed ring + pause glyph)
- Make the wizard's options obviously clickable (pill chips + states)
- Redesign dashboard as a 2-column layout (no scroll, wider modal)
- Per-event Pushover sound + priority (grouped under headers)
- Wizard options now look like real buttons (style_class button + bold hint)

### Miscellaneous

- Initial commit (personal source of truth)
- Drop unused legacy 3.6 version dir
- Ignore generated dist/ (Spices export)
- *(i18n)* Russian translations for new settings/comboboxes
- Add build-public.sh: reproducible sanitized public build (marker-driven) + mark private regions
- *(i18n)* Russian translations for all new strings
- *(i18n)* Translate core new strings into de/es/fr/it/pt/pt_BR/nl/pl/uk
- *(i18n)* Refresh .pot/dist with dashboard-insight strings

### Refactor

- Rebrand display name to Zen Pomodoro (live; UUID unchanged)
- Rebrand live metadata: Zen description, version 1.2.0-local, refreshed date
- Rename live applet UUID focus-pomodoro@vladimir.local -> zen-pomodoro@vtestah
- Extract menu.js + dialogs.js from applet.js (4245->3202); build/self-test handle all modules; retire monolith rebuilder
- Extract constants.js (45 POMODORO_* consts); applet.js re-binds via destructuring
- Visual.js prototype-mixin (32 frame/glow/appearance methods); applet.js 3191->2253; build+self-test handle constants.js/visual.js
- Features.js mixin (breathing/zen/ambient/daily-stats/idle/focus-until/flow-extend, 18 methods); applet.js 2252->1841
- Soundfx.js mixin (sound effects, 6 methods); applet.js 1841->1815
- Declutter settings (fewer tabs, grouping, tooltips)
- Use switch toggles for boolean settings
- Fold personal Scripts into Advanced (6 tabs locally too)
- Move keyboard shortcuts into their own settings section
- Replace borrowed qrcode 'symbolic' icons with a real tomato symbolic

<!-- generated by git-cliff -->
