"""Property-based tests for /etc/hosts section management (Requirement 4).

Covers correctness properties 5-9 from the design document: ``strip_section``
preserves text outside the Block_Section and removes its content, leaves no
marker lines behind, the ``block`` -> ``unblock`` round-trip preserves external
content, and both ``block`` and ``strip_section`` are idempotent.

All tests are fully isolated from the real ``/etc/hosts`` and never require
root: writes go to unique files inside ``tmp_path`` and the module-level
``HOSTS`` constant is monkeypatched per example.
"""

from uuid import uuid4

from hypothesis import HealthCheck, assume, given, settings
from hypothesis import strategies as st

from conftest import run_block

# Marker literals mirror hosts-helper.py (BEGIN/END). Used only to keep the
# text generators from producing lines that look like section markers. Tests
# themselves reference hosts_helper.BEGIN / hosts_helper.END.
_BEGIN = "# >>> zen-pomodoro block >>>"
_END = "# <<< zen-pomodoro block <<<"

_FN_FIXTURE = [HealthCheck.function_scoped_fixture]


# --- Strategies -----------------------------------------------------------

def _line():
    """A single arbitrary hosts-file line that is never a section marker."""
    return (
        st.from_regex(r"[ -~]{0,40}", fullmatch=True)
        .filter(lambda s: s.strip() not in (_BEGIN, _END))
    )


_text_lines = st.lists(_line(), max_size=15)
# Section content lines (the bit between the markers that must be dropped).
_block_content = st.lists(
    st.from_regex(r"0\.0\.0\.0 [a-z0-9.]{1,20}", fullmatch=True), max_size=5
)


@st.composite
def hosts_file_text(draw):
    """Arbitrary /etc/hosts content, optionally embedding a Block_Section."""
    lines = draw(_text_lines)
    if draw(st.booleans()):
        section = [_BEGIN, *draw(_block_content), _END]
        pos = draw(st.integers(min_value=0, max_value=len(lines)))
        lines = lines[:pos] + section + lines[pos:]
    return "\n".join(lines)


@st.composite
def text_with_section(draw):
    """(full_text, outside_lines): outside text with a section inserted."""
    outside = draw(_text_lines)
    section = [_BEGIN, *draw(_block_content), _END]
    pos = draw(st.integers(min_value=0, max_value=len(outside)))
    full = outside[:pos] + section + outside[pos:]
    return "\n".join(full), outside


def _hosts_file_no_section():
    """Arbitrary /etc/hosts content guaranteed to contain no Block_Section."""
    return st.lists(_line(), max_size=15).map("\n".join)


_label = st.text(alphabet="abcdefghijklmnopqrstuvwxyz0123456789",
                 min_size=1, max_size=20)


@st.composite
def valid_hostnames(draw):
    """2-4 labels of 1-20 [a-z0-9] chars, total length <= 253."""
    n = draw(st.integers(min_value=2, max_value=4))
    host = ".".join(draw(_label) for _ in range(n))
    assume(len(host) <= 253)
    return host


# --- Helpers --------------------------------------------------------------

def _drop_trailing_empty(lines):
    lines = list(lines)
    while lines and lines[-1] == "":
        lines.pop()
    return lines


def run_unblock(helper, hosts_path, monkeypatch):
    """Run the ``unblock`` action against an isolated hosts file.

    Mirrors ``conftest.run_block``: fakes ``geteuid``, points ``HOSTS`` at
    ``hosts_path``, sets ``sys.argv`` for unblock, invokes ``main()``, and
    returns ``(return_code, file_text)``.
    """
    monkeypatch.setattr(helper.os, "geteuid", lambda: 0)
    monkeypatch.setattr(helper, "HOSTS", str(hosts_path))
    monkeypatch.setattr(helper.sys, "argv", ["hosts-helper.py", "unblock"])
    rc = helper.main()
    text = hosts_path.read_text() if hosts_path.exists() else ""
    return rc, text


# --- Property tests -------------------------------------------------------

# Feature: applet-test-suite, Property 5: Strip_Function сохраняет текст вне секции и удаляет содержимое секции
# Validates: Requirements 4.1
@given(data=text_with_section())
@settings(max_examples=100)
def test_strip_preserves_outside_and_removes_section(hosts_helper, data):
    full_text, outside = data
    result = hosts_helper.strip_section(full_text)
    result_lines = result.splitlines()

    # Outside lines are preserved verbatim (modulo trailing-newline
    # normalization performed by strip_section).
    assert _drop_trailing_empty(result_lines) == _drop_trailing_empty(outside)

    # The section markers and everything between them are gone.
    for line in result_lines:
        assert line.strip() != hosts_helper.BEGIN
        assert line.strip() != hosts_helper.END


# Feature: applet-test-suite, Property 6: После Strip_Function не остаётся строк-маркеров
# Validates: Requirements 4.5
@given(text=hosts_file_text())
@settings(max_examples=100)
def test_strip_leaves_no_marker_lines(hosts_helper, text):
    result = hosts_helper.strip_section(text)
    for line in result.splitlines():
        assert line.strip() != hosts_helper.BEGIN
        assert line.strip() != hosts_helper.END


# Feature: applet-test-suite, Property 7: Round-trip block → unblock сохраняет внешнее содержимое
# Validates: Requirements 4.2
@given(original=_hosts_file_no_section(),
       domains=st.lists(valid_hostnames(), min_size=1, max_size=4))
@settings(max_examples=100, suppress_health_check=_FN_FIXTURE)
def test_block_then_unblock_round_trip(hosts_helper, tmp_path, monkeypatch,
                                       original, domains):
    hosts_path = tmp_path / f"hosts_{uuid4().hex}"
    hosts_path.write_text(original)

    run_block(hosts_helper, hosts_path, domains, monkeypatch)
    run_unblock(hosts_helper, hosts_path, monkeypatch)

    final = hosts_path.read_text()
    # Content outside the Block_Section matches the original (both normalized
    # through strip_section to account for trailing-newline normalization).
    assert hosts_helper.strip_section(final) == \
        hosts_helper.strip_section(original)


# Feature: applet-test-suite, Property 8: Идемпотентность действия block
# Validates: Requirements 4.3
@given(original=_hosts_file_no_section(),
       domains=st.lists(valid_hostnames(), min_size=1, max_size=4))
@settings(max_examples=100, suppress_health_check=_FN_FIXTURE)
def test_block_is_idempotent(hosts_helper, tmp_path, monkeypatch,
                             original, domains):
    once_path = tmp_path / f"once_{uuid4().hex}"
    once_path.write_text(original)
    run_block(hosts_helper, once_path, domains, monkeypatch)
    once = once_path.read_text()

    twice_path = tmp_path / f"twice_{uuid4().hex}"
    twice_path.write_text(original)
    run_block(hosts_helper, twice_path, domains, monkeypatch)
    run_block(hosts_helper, twice_path, domains, monkeypatch)
    twice = twice_path.read_text()

    assert twice == once


# Feature: applet-test-suite, Property 9: Идемпотентность Strip_Function
# Validates: Requirements 4.6
@given(text=hosts_file_text())
@settings(max_examples=100)
def test_strip_section_is_idempotent(hosts_helper, text):
    once = hosts_helper.strip_section(text)
    twice = hosts_helper.strip_section(once)
    assert twice == once
