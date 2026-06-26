"""Tests for safe hosts-file writing in ``hosts-helper.py`` (Requirement 5).

Covers:
- Example tests that ``write_hosts``/``block`` writes to the monkeypatched
  ``isolated_hosts`` path and creates a fresh file with a correct Block_Section
  when the source hosts file is missing (5.1, 5.3).
- Property 10: the destination directory contains no leftover temporary files
  with the ``.zenhosts`` prefix after a write (5.2).
- Error-handling edge cases: a failing ``read_hosts`` makes ``main()`` return
  ``1`` without writing, and a failing ``os.replace`` removes the temporary
  ``.zenhosts`` file (negative scenario of Property 10) (5.2).

All tests stay isolated from the real ``/etc/hosts`` and never require root.
"""

import os
import tempfile

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from conftest import run_block


# ---------------------------------------------------------------------------
# Task 6.1 — Example tests: writing to the monkeypatched path
# ---------------------------------------------------------------------------

def test_block_writes_to_isolated_path(hosts_helper, isolated_hosts, monkeypatch):
    """block writes to the monkeypatched isolated_hosts path (Requirement 5.1)."""
    rc, text = run_block(hosts_helper, isolated_hosts, ["example.com"], monkeypatch)

    assert rc == 0
    # The result lands in exactly the substituted path, not the real /etc/hosts.
    assert isolated_hosts.exists()
    assert isolated_hosts.read_text() == text
    assert "0.0.0.0 example.com" in text


def test_write_hosts_writes_to_isolated_path(hosts_helper, isolated_hosts, monkeypatch):
    """write_hosts writes its content to the substituted HOSTS path (5.1)."""
    monkeypatch.setattr(hosts_helper, "HOSTS", str(isolated_hosts))
    payload = "127.0.0.1 localhost\n"

    hosts_helper.write_hosts(payload)

    assert isolated_hosts.exists()
    assert isolated_hosts.read_text() == payload


def test_block_creates_file_when_source_missing(hosts_helper, isolated_hosts, monkeypatch):
    """block creates a file with a correct Block_Section when none exists (5.3)."""
    # Precondition: no source hosts file present.
    assert not isolated_hosts.exists()

    rc, text = run_block(hosts_helper, isolated_hosts, ["example.com"], monkeypatch)

    assert rc == 0
    assert isolated_hosts.exists()
    # A correct Block_Section: markers plus the paired bare/www entries.
    assert hosts_helper.BEGIN in text
    assert hosts_helper.END in text
    assert "0.0.0.0 example.com" in text
    assert "0.0.0.0 www.example.com" in text


# ---------------------------------------------------------------------------
# Task 6.2 — Property 10: no leftover temp files after a write
# ---------------------------------------------------------------------------

# Feature: applet-test-suite, Property 10: Каталог назначения не содержит временных файлов после записи
@settings(max_examples=100)
@given(text=st.text())
def test_no_temp_files_left_after_write(hosts_helper, text):
    """For any valid text, write_hosts leaves no ``.zenhosts`` temp files.

    Manages the destination directory and the ``HOSTS`` override inside the
    test body (instead of function-scoped fixtures) so each Hypothesis example
    runs against a clean, isolated directory.

    **Validates: Requirements 5.2**
    """
    original_hosts = hosts_helper.HOSTS
    with tempfile.TemporaryDirectory() as directory:
        hosts_path = os.path.join(directory, "hosts")
        hosts_helper.HOSTS = hosts_path
        try:
            hosts_helper.write_hosts(text)

            # Property 10 concerns leftover temp files, not exact byte content
            # (write_hosts opens in text mode, so newlines may be translated).
            assert os.path.exists(hosts_path)
            leftovers = [
                name for name in os.listdir(directory)
                if name.startswith(".zenhosts")
            ]
            assert leftovers == []
        finally:
            hosts_helper.HOSTS = original_hosts


# ---------------------------------------------------------------------------
# Task 6.3 — Error-handling edge cases
# ---------------------------------------------------------------------------

def test_read_error_returns_1_without_writing(hosts_helper, isolated_hosts, monkeypatch):
    """A failing read_hosts → main() returns 1 and never calls write_hosts."""
    monkeypatch.setattr(hosts_helper.os, "geteuid", lambda: 0)
    monkeypatch.setattr(
        hosts_helper.sys, "argv", ["hosts-helper.py", "block", "example.com"]
    )

    def boom():
        raise OSError("read failure")

    monkeypatch.setattr(hosts_helper, "read_hosts", boom)

    write_called = {"hit": False}

    def fake_write(_text):
        write_called["hit"] = True

    monkeypatch.setattr(hosts_helper, "write_hosts", fake_write)

    rc = hosts_helper.main()

    assert rc == 1
    assert write_called["hit"] is False
    # Nothing was written to the destination path.
    assert not isolated_hosts.exists()


def test_replace_failure_removes_temp_file(hosts_helper, isolated_hosts, monkeypatch):
    """A failing os.replace → the temporary ``.zenhosts`` file is removed."""
    monkeypatch.setattr(hosts_helper, "HOSTS", str(isolated_hosts))

    def boom(_src, _dst):
        raise OSError("replace failure")

    monkeypatch.setattr(hosts_helper.os, "replace", boom)

    with pytest.raises(OSError):
        hosts_helper.write_hosts("content\n")

    directory = isolated_hosts.parent
    leftovers = [name for name in os.listdir(directory) if name.startswith(".zenhosts")]
    assert leftovers == []
    # The destination was never created since replace failed.
    assert not isolated_hosts.exists()
