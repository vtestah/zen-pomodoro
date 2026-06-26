"""Shared pytest fixtures and helpers for the applet test suite.

The Python sources under ``6.4/`` (``hosts-helper.py`` and
``setup-passwordless.py``) use a hyphen in their filename, so they are not
importable as regular Python modules. They are loaded by file path instead,
without renaming the originals (Requirement 1.3).

All fixtures keep tests fully isolated from the real ``/etc/hosts`` and never
require root: writes go to a temporary directory via ``tmp_path`` and the
module-level ``HOSTS`` constant is monkeypatched (Requirement 1.4).
"""

import importlib.util
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = REPO_ROOT / "6.4"


def load_source_module(filename, module_name):
    """Load a ``.py`` file by path as a module, without needing a valid name.

    Solves the hyphen-in-filename problem (Requirement 1.3) by using
    ``importlib.util.spec_from_file_location`` + ``module_from_spec`` +
    ``exec_module``. Raises :class:`ImportError` with a clear path if the
    source file is missing so failures are fast and explicit.
    """
    path = SRC_DIR / filename
    if not path.is_file():
        raise ImportError(f"cannot load source module: {path} not found")
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="session")
def hosts_helper():
    """Loaded ``hosts-helper.py`` module."""
    return load_source_module("hosts-helper.py", "hosts_helper")


@pytest.fixture(scope="session")
def setup_helper():
    """Loaded ``setup-passwordless.py`` module."""
    return load_source_module("setup-passwordless.py", "setup_passwordless")


@pytest.fixture
def isolated_hosts(hosts_helper, tmp_path, monkeypatch):
    """Path to a temporary hosts file with ``HOSTS`` monkeypatched to it.

    ``write_hosts`` derives its temp-file directory from
    ``os.path.dirname(HOSTS)``, so pointing ``HOSTS`` inside ``tmp_path`` keeps
    ``mkstemp`` and ``os.replace`` fully contained in the temporary directory.
    """
    hosts_path = tmp_path / "hosts"
    monkeypatch.setattr(hosts_helper, "HOSTS", str(hosts_path))
    return hosts_path


def run_block(helper, hosts_path, domains, monkeypatch):
    """Run the ``block`` action against an isolated hosts file.

    Sets up ``sys.argv``, fakes ``geteuid`` to bypass the root check, points
    ``HOSTS`` at ``hosts_path``, invokes ``main()``, and returns the resulting
    ``(return_code, file_text)``. This exercises the real execution path
    (normalization + section assembly live inside ``main()``) without modifying
    the source.
    """
    monkeypatch.setattr(helper.os, "geteuid", lambda: 0)
    monkeypatch.setattr(helper, "HOSTS", str(hosts_path))
    monkeypatch.setattr(
        helper.sys, "argv", ["hosts-helper.py", "block", *domains]
    )
    rc = helper.main()
    text = hosts_path.read_text() if Path(hosts_path).exists() else ""
    return rc, text
