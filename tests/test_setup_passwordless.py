"""Example tests for Setup_Helper argument validation and the polkit policy template.

These tests exercise ONLY the early validation branches of ``install`` and the
string content of ``POLICY_TMPL``. They never perform root operations: every
assertion stops before ``install`` reaches the file copy / chown / write steps,
and the template is rendered purely as a string in-memory (Requirements 6.1,
6.2, 6.3, 6.4, 7.2).
"""


def test_install_rejects_bad_mode_with_code_2(setup_helper):
    """An unknown mode returns 2 before any source/file checks (Requirement 6.1).

    ``src`` is irrelevant here: the mode check happens first, so install must
    return 2 without touching the filesystem regardless of the source argument.
    """
    assert setup_helper.install("bogus", "/anything/at/all") == 2


def test_install_rejects_missing_source_with_code_2(setup_helper):
    """A valid mode but missing source file returns 2 (Requirement 6.2).

    ``keep`` is a valid mode, so validation moves on to the source check, which
    fails because the path does not exist, returning 2 before root operations.
    """
    assert setup_helper.install("keep", "/nonexistent/helper/path") == 2


def test_policy_template_keep_mode_contains_auth_admin_keep(setup_helper):
    """Rendered policy for ``keep`` mode contains ``auth_admin_keep`` (Requirement 6.3).

    For ``keep`` the code computes ``allow = "auth_admin_keep"`` and substitutes
    it into ``<allow_active>``. Render the template directly to avoid root work.
    """
    rendered = setup_helper.POLICY_TMPL % {
        "action": setup_helper.ACTION_ID,
        "mode": "auth_admin_keep",
        "dest": setup_helper.DEST,
    }
    assert "auth_admin_keep" in rendered
    assert "<allow_active>auth_admin_keep</allow_active>" in rendered


def test_policy_template_yes_mode_contains_yes_in_allow_active(setup_helper):
    """Rendered policy for ``yes`` mode contains ``yes`` in allow_active (Requirement 6.4).

    For ``yes`` the code computes ``allow = "yes"`` and substitutes it into the
    ``<allow_active>`` line for the active session.
    """
    rendered = setup_helper.POLICY_TMPL % {
        "action": setup_helper.ACTION_ID,
        "mode": "yes",
        "dest": setup_helper.DEST,
    }
    assert "<allow_active>yes</allow_active>" in rendered
