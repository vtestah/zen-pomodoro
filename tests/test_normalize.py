"""Tests for user-input normalization in the ``block`` action of hosts-helper.

Covers Requirement 2 (Нормализация пользовательского ввода в имя хоста):

* Example tests (Task 2.1) — concrete URLs reduced to a bare hostname.
* Property 1 (Task 2.2) — for any valid hostname with arbitrary scheme,
  userinfo, port, path/query, ``www.`` prefix and arbitrary letter case,
  normalization yields the bare lowercase hostname.

Normalization lives inside ``main()``'s ``block`` branch, so it is exercised
through the ``run_block`` helper from ``conftest.py`` and verified by inspecting
the resulting Block_Section.
"""

import string

import pytest
from hypothesis import assume, given, settings
from hypothesis import strategies as st

from conftest import run_block

# Label characters: lowercase letters + digits keep every generated label
# valid under HOST_RE regardless of length (1-20), avoiding hyphen edge cases.
LABEL_CHARS = string.ascii_lowercase + string.digits


def block_section_hosts(text, helper):
    """Return the bare host arguments of ``0.0.0.0 X`` lines inside the section.

    Parses only the lines between the Block_Section markers and strips the
    ``0.0.0.0 `` prefix, yielding the ordered list of host entries written.
    """
    hosts = []
    inside = False
    for line in text.splitlines():
        stripped = line.strip()
        if stripped == helper.BEGIN:
            inside = True
            continue
        if stripped == helper.END:
            inside = False
            continue
        if inside and stripped.startswith("0.0.0.0 "):
            hosts.append(stripped[len("0.0.0.0 "):])
    return hosts


# ---------------------------------------------------------------------------
# Task 2.1 — example tests (Requirements 2.1, 2.2)
# ---------------------------------------------------------------------------

def test_scheme_and_path_reduced_to_bare_host(hosts_helper, isolated_hosts, monkeypatch):
    """``https://ya.ru/path`` normalizes to ``ya.ru`` (Requirement 2.1)."""
    rc, text = run_block(hosts_helper, isolated_hosts, ["https://ya.ru/path"], monkeypatch)
    assert rc == 0
    assert block_section_hosts(text, hosts_helper) == ["ya.ru", "www.ya.ru"]


def test_scheme_userinfo_port_path_query_all_removed(hosts_helper, isolated_hosts, monkeypatch):
    """``http://user@example.com:8080/x?y=1`` normalizes to ``example.com``.

    Verifies the scheme, userinfo, port, path and query are all stripped
    (Requirement 2.2).
    """
    rc, text = run_block(
        hosts_helper, isolated_hosts, ["http://user@example.com:8080/x?y=1"], monkeypatch
    )
    assert rc == 0
    assert block_section_hosts(text, hosts_helper) == ["example.com", "www.example.com"]


# ---------------------------------------------------------------------------
# Task 2.2 — Property 1
# ---------------------------------------------------------------------------

@st.composite
def valid_hostnames(draw):
    """Generate a valid hostname: 2-4 labels of 1-20 ``[a-z0-9]`` chars.

    The first label is never exactly ``www`` so that prepending a ``www.``
    prefix exercises exactly one stripping step (the source strips only one
    leading ``www.``). Total length is constrained to <= 253 per HOST_RE.
    """
    n = draw(st.integers(min_value=2, max_value=4))
    labels = []
    for _ in range(n):
        size = draw(st.integers(min_value=1, max_value=20))
        labels.append(draw(st.text(alphabet=LABEL_CHARS, min_size=size, max_size=size)))
    assume(labels[0] != "www")
    host = ".".join(labels)
    assume(len(host) <= 253)
    return host


_SCHEMES = st.sampled_from(["http", "https", "ftp", "ssh", "git+ssh", "my-scheme"])


@st.composite
def prefixed_inputs(draw):
    """Build a noisy input string plus its expected bare-hostname result.

    Optionally prepends scheme, userinfo, ``www.``; optionally appends port and
    path/query; then randomizes the letter case of the whole string. The
    expected normalized result is always the lowercase bare hostname.
    """
    host = draw(valid_hostnames())
    s = ""

    if draw(st.booleans()):
        s += draw(_SCHEMES) + "://"

    if draw(st.booleans()):
        user = draw(st.text(alphabet=LABEL_CHARS, min_size=1, max_size=8))
        if draw(st.booleans()):
            pw = draw(st.text(alphabet=LABEL_CHARS, min_size=1, max_size=8))
            s += "%s:%s@" % (user, pw)
        else:
            s += "%s@" % user

    if draw(st.booleans()):
        s += "www."

    s += host

    if draw(st.booleans()):
        s += ":%d" % draw(st.integers(min_value=1, max_value=65535))

    path_kind = draw(st.integers(min_value=0, max_value=3))
    if path_kind == 1:
        s += "/" + draw(st.text(alphabet=LABEL_CHARS, min_size=0, max_size=10))
    elif path_kind == 2:
        seg = draw(st.text(alphabet=LABEL_CHARS, min_size=0, max_size=5))
        q = draw(st.text(alphabet=LABEL_CHARS, min_size=1, max_size=5))
        s += "/" + seg + "?" + q + "=1"
    elif path_kind == 3:
        q = draw(st.text(alphabet=LABEL_CHARS, min_size=1, max_size=5))
        s += "?" + q + "=1"

    flags = draw(st.lists(st.booleans(), min_size=len(s), max_size=len(s)))
    cased = "".join(c.upper() if f else c for c, f in zip(s, flags))
    return cased, host


# Feature: applet-test-suite, Property 1: Нормализация приводит к голому имени хоста в нижнем регистре
@settings(max_examples=100)
@given(data=prefixed_inputs())
def test_normalization_yields_bare_lowercase_host(hosts_helper, tmp_path_factory, data):
    """Property 1 — Validates Requirements 2.2, 2.3, 2.4.

    For any valid hostname ``h`` with arbitrary scheme/userinfo/port/path/query/
    ``www.`` prefixes and arbitrary case, the ``block`` action normalizes the
    input to the lowercase bare hostname ``h`` (no scheme, userinfo, port, path,
    query, or ``www.`` prefix).
    """
    raw, host = data
    hosts_path = tmp_path_factory.mktemp("hosts") / "hosts"
    # A fresh MonkeyPatch context per generated example keeps state isolated
    # (function-scoped monkeypatch fixtures are not reset between @given inputs).
    with pytest.MonkeyPatch.context() as mp:
        rc, text = run_block(hosts_helper, hosts_path, [raw], mp)
    assert rc == 0
    assert block_section_hosts(text, hosts_helper) == [host, "www." + host]
