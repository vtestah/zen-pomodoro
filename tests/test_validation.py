"""Property-based tests for hostname validation in ``hosts-helper.py``.

Covers Requirement 3 (валидация имён хостов) via three Hypothesis properties:

* Property 2 — валидное имя попадает в Block_Section с парной www-записью.
* Property 3 — невалидные строки отклоняются и отсутствуют в Block_Section.
* Property 4 — уникальность записей при дубликатах.

All tests are fully isolated from the real ``/etc/hosts``: writes go to the
``isolated_hosts`` temp file and ``run_block`` fakes ``geteuid`` so no root is
required. See ``conftest.py`` for the shared fixtures and helpers.
"""

import re

from hypothesis import HealthCheck, assume, given, settings
from hypothesis import strategies as st

from conftest import run_block

# Local copy of the source HOST_RE, used only inside generators for filtering.
# Test bodies assert against the real ``hosts_helper.HOST_RE`` from the module.
_HOST_RE = re.compile(
    r"^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
    r"(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$"
)

_PBT_SETTINGS = settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)

_LABEL_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"


# --------------------------------------------------------------------------- #
# Strategies
# --------------------------------------------------------------------------- #
_label = st.text(alphabet=_LABEL_ALPHABET, min_size=1, max_size=20)


@st.composite
def valid_hostnames(draw):
    """Generate valid hostnames: 2-4 labels of [a-z0-9] (1-20 chars).

    Construction guarantees a match against ``HOST_RE``; we additionally
    exclude names beginning with ``www.`` (normalization would strip that
    prefix) and keep the total length within 253 characters.
    """
    n = draw(st.integers(min_value=2, max_value=4))
    labels = draw(st.lists(_label, min_size=n, max_size=n))
    host = ".".join(labels)
    assume(len(host) <= 253)
    assume(not host.startswith("www."))
    assume(_HOST_RE.match(host) is not None)
    return host


# Invalid category A: a single label with no dot separator (e.g. "localhost").
_no_dot = st.text(alphabet=_LABEL_ALPHABET, min_size=1, max_size=30).filter(
    lambda s: "." not in s
)

# Invalid category B: a leading label longer than 63 characters.
_long_label = st.builds(
    lambda n, tld: "a" * n + "." + tld,
    st.integers(min_value=64, max_value=80),
    st.sampled_from(["com", "org", "net"]),
)

# Invalid category C: illegal characters. The chosen characters are never
# stripped by normalization (it only removes scheme, '/', '?', '@', ':'), so
# the bad character survives and HOST_RE rejects the string.
_illegal_char = st.sampled_from(list("_!#$%^&*()=,;<> "))
_illegal = st.builds(
    lambda a, c, b, tld: f"{a}{c}{b}.{tld}",
    st.text(alphabet="abc", min_size=1, max_size=5),
    _illegal_char,
    st.text(alphabet="abc", min_size=1, max_size=5),
    st.sampled_from(["com", "org", "net"]),
)

# Invalid category D: empty strings.
_empty = st.just("")

invalid_hostnames = st.one_of(_no_dot, _long_label, _illegal, _empty)


# Decorations that all normalize back to the bare hostname ``b``.
def _decorate(b):
    return st.sampled_from(
        [
            b,
            b.upper(),
            "www." + b,
            "https://" + b + "/path",
            "http://user@" + b + ":8080/x?y=1",
            b + "/foo?bar=1",
        ]
    )


@st.composite
def user_string_lists(draw):
    """A list of user-typed strings containing post-normalization duplicates."""
    bases = draw(st.lists(valid_hostnames(), min_size=1, max_size=5))
    items = []
    for b in bases:
        variants = draw(st.lists(_decorate(b), min_size=1, max_size=3))
        items.extend(variants)
    return items


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _section_lines(text, helper):
    """Return the entry lines inside Block_Section (markers excluded)."""
    out = []
    inside = False
    for line in text.splitlines():
        stripped = line.strip()
        if stripped == helper.BEGIN:
            inside = True
            continue
        if stripped == helper.END:
            inside = False
            continue
        if inside:
            out.append(line)
    return out


# --------------------------------------------------------------------------- #
# Property 2
# --------------------------------------------------------------------------- #
# Feature: applet-test-suite, Property 2: Валидное имя попадает в Block_Section с парной www-записью
# Validates: Requirements 3.1, 4.4
@_PBT_SETTINGS
@given(host=valid_hostnames())
def test_valid_hostname_with_paired_www_entry(
    host, hosts_helper, isolated_hosts, monkeypatch
):
    rc, text = run_block(hosts_helper, isolated_hosts, [host], monkeypatch)

    assert rc == 0
    lines = _section_lines(text, hosts_helper)
    assert f"0.0.0.0 {host}" in lines
    assert f"0.0.0.0 www.{host}" in lines


# --------------------------------------------------------------------------- #
# Property 3
# --------------------------------------------------------------------------- #
# Feature: applet-test-suite, Property 3: Невалидные строки отклоняются и отсутствуют в Block_Section
# Validates: Requirements 3.2, 3.3, 3.5
@_PBT_SETTINGS
@given(bad=invalid_hostnames)
def test_invalid_strings_are_rejected_and_absent(
    bad, hosts_helper, isolated_hosts, monkeypatch
):
    # HOST_RE must not accept the invalid string.
    assert hosts_helper.HOST_RE.match(bad) is None

    rc, text = run_block(hosts_helper, isolated_hosts, [bad], monkeypatch)

    assert rc == 0
    # A rejected string yields no Block_Section at all.
    assert hosts_helper.BEGIN not in text
    assert hosts_helper.END not in text
    # And the literal string never appears in the (empty) section.
    assert _section_lines(text, hosts_helper) == []
    if bad:
        assert bad not in text


# --------------------------------------------------------------------------- #
# Property 4
# --------------------------------------------------------------------------- #
def _normalize(raw):
    """Replicate the normalization performed inside the ``block`` action."""
    d = raw.strip().lower()
    d = re.sub(r"^[a-z][a-z0-9+.\-]*://", "", d)
    d = d.split("/", 1)[0].split("?", 1)[0]
    if "@" in d:
        d = d.split("@", 1)[1]
    d = d.split(":", 1)[0]
    if d.startswith("www."):
        d = d[4:]
    return d


# Feature: applet-test-suite, Property 4: Уникальность записей при дубликатах
# Validates: Requirements 3.4
@_PBT_SETTINGS
@given(raw_inputs=user_string_lists())
def test_duplicate_inputs_yield_unique_entries(
    raw_inputs, hosts_helper, isolated_hosts, monkeypatch
):
    rc, text = run_block(hosts_helper, isolated_hosts, raw_inputs, monkeypatch)

    assert rc == 0
    lines = _section_lines(text, hosts_helper)

    # Expected unique set of valid bare hostnames after normalization.
    expected = {
        d
        for d in (_normalize(r) for r in raw_inputs)
        if d and _HOST_RE.match(d)
    }

    for name in expected:
        assert lines.count(f"0.0.0.0 {name}") == 1
        assert lines.count(f"0.0.0.0 www.{name}") == 1
