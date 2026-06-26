"""Smoke tests for the test infrastructure (Requirement 1.1, 1.2, 1.3).

These tests confirm that:
- the by-path source loader (``load_source_module``) can import the hyphenated
  source files ``hosts-helper.py`` and ``setup-passwordless.py`` as modules
  without renaming them (Requirement 1.3);
- the loaded modules expose the key attributes the rest of the suite relies on,
  which in turn confirms the ``tests/`` directory and pytest configuration are
  wired up correctly (Requirement 1.1, 1.2).
"""

import types

from conftest import load_source_module


def test_load_hosts_helper_returns_module():
    # Requirement 1.3: hyphenated source loaded by path as a real module.
    module = load_source_module("hosts-helper.py", "hosts_helper")
    assert isinstance(module, types.ModuleType)


def test_load_setup_passwordless_returns_module():
    # Requirement 1.3: second hyphenated source also loads as a module.
    module = load_source_module("setup-passwordless.py", "setup_passwordless")
    assert isinstance(module, types.ModuleType)


def test_hosts_helper_exposes_key_attributes(hosts_helper):
    # Requirement 1.1, 1.2: smoke-check the helper's public surface so a broken
    # test directory / config surfaces immediately.
    for attr in ("strip_section", "HOST_RE", "write_hosts", "read_hosts",
                 "main", "BEGIN", "END", "HOSTS"):
        assert hasattr(hosts_helper, attr), f"missing attribute: {attr}"


def test_hosts_helper_callables_and_constants(hosts_helper):
    # The key functions must be callable and the markers must be the expected
    # block delimiters.
    assert callable(hosts_helper.strip_section)
    assert callable(hosts_helper.write_hosts)
    assert callable(hosts_helper.main)
    assert hosts_helper.BEGIN == "# >>> zen-pomodoro block >>>"
    assert hosts_helper.END == "# <<< zen-pomodoro block <<<"


def test_setup_helper_exposes_key_attributes(setup_helper):
    # Requirement 1.1, 1.2: smoke-check the setup helper's public surface.
    for attr in ("install", "uninstall", "main", "POLICY_TMPL",
                 "ACTION_ID", "DEST"):
        assert hasattr(setup_helper, attr), f"missing attribute: {attr}"


def test_setup_helper_callables(setup_helper):
    assert callable(setup_helper.install)
    assert callable(setup_helper.uninstall)
    assert callable(setup_helper.main)
    assert isinstance(setup_helper.POLICY_TMPL, str)
