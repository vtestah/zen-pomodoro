# Security Policy

## Supported versions

Zen Pomodoro is a Cinnamon applet released on a rolling basis. Security fixes
target the latest released version (see `metadata.json` / the latest tag).
Please reproduce on the latest version before reporting.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's private vulnerability reporting — **Security → Report a vulnerability**
on this repository:
<https://github.com/vtestah/zen-pomodoro/security/advisories/new>

Include the affected version, your Cinnamon/distribution version, steps to
reproduce, and the impact. You'll get an acknowledgement and a fix timeline.

## Security-relevant surface

Most of the applet (timer, menu, on-screen cues) never touches anything outside
its own state under `$XDG_STATE_HOME/zen-pomodoro/`. A few **optional,
off-by-default** features interact with the system and get extra scrutiny:

- **Distraction blocking** edits a clearly-marked block of `/etc/hosts`. Because
  that file is root-owned, changes run through a small bundled helper invoked
  with **pkexec** (the standard graphical admin prompt). Hostnames are validated
  and only the marked section is touched. An optional one-time polkit policy
  enables passwordless toggling and can be removed at any time.
- **Run a command** can launch a user-chosen command on focus/break/goal events.
  Commands run with your own privileges and only what you configure — treat those
  fields like anything else that runs code on your machine.
- **Pushover notifications** send phase changes to your devices using **your own**
  user key and app token, stored in the applet's settings and sent only to
  Pushover's API, only when you enable the feature.

If you find a way for any of these to act outside the documented, user-consented
scope, please report it via the channel above.
