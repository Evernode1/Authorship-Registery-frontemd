"""Whole-lifecycle logic tests on a dict-backed copy of the contract: money, states, tiers.
The web and the model are faked. These prove the contract's own rules, not StudioNet behaviour."""
AUTHOR = "0x" + "aa" * 20
CHAL = "0x" + "bb" * 20
KEEPER = "0x" + "cc" * 20
OTHER = "0x" + "dd" * 20
PAGE = "https://author.example/post"
EARLY = "https://chal.example/old"
SNAP = "https://web.archive.org/web/19910101000000/"
T0 = "2026-09-21T10:00:00Z"
T_DAY2 = "2026-09-22T11:00:00Z"
T_DAY5 = "2026-09-26T10:00:00Z"
T_DAY7 = "2026-09-28T10:00:00Z"
BOND = 10**15
STAKE = 5 * 10**15
REWARD = 5 * 10**14


def head_page(token):
    return f'<html><head><meta name="oar-proof" content="{token}"></head><body>x</body></html>'


def wayback(stamp14):
    return f'<html><head><script>wbinfo.timestamp = "{stamp14}";</script></head><body>x</body></html>'


def balanced(c):
    a = c.get_accounting()
    assert a["balanced"], a


def register(chain, world, wallet=AUTHOR):
    chain.at(T0)
    chain.as_(wallet, BOND).register_work(PAGE, "My post", "POST", "")
    return 1


def register_challenger(chain):
    """The challenger registers the earlier page under their own wallet. Its id is 2 in every test."""
    chain.at(T0)
    chain.as_(CHAL, BOND).register_work(EARLY, "Old article", "POST", "")
    return 2


def verify_ownership(chain, world, wid=1, keeper=KEEPER):
    c = chain.contract
    token = c.get_work_proof(wid)
    world["pages"][(PAGE, "html")] = head_page(token)
    world["pages"][(PAGE, "text")] = "x"
    chain.as_(keeper).verify_work_ownership(wid)


def prime_challenge_pages(world, token, chal_stamp="20190101000000", work_stamp=None, sim="IDENTICAL"):
    world["pages"][(EARLY, "html")] = head_page(token)
    world["pages"][(EARLY, "text")] = "old original text"
    world["pages"][(SNAP + EARLY, "html")] = wayback(chal_stamp)
    world["pages"][(SNAP + EARLY, "text")] = "old original text"
    world["pages"][(PAGE, "text")] = "old original text"
    if work_stamp:
        world["pages"][(SNAP + PAGE, "html")] = wayback(work_stamp)
    world["llm"] = {"similarity": sim, "evidence_status": "NOT_PROVIDED"}


# ---------------------------------------------------------------- registration and tiers

def test_new_registration_is_an_unverified_claim(chain, world):
    register(chain, world)
    w = chain.contract.get_work(1)
    assert w["ownership"] == "UNVERIFIED"
    assert w["authorship_tier"] == "UNVERIFIED_CLAIM"
    assert chain.contract.get_first_author(PAGE)["authorship_tier"] == "UNVERIFIED_CLAIM"
    balanced(chain.contract)


def test_head_proof_upgrades_to_verified_and_pays_keeper(chain, world):
    register(chain, world)
    chain.as_(OTHER, REWARD * 4).fund_rewards()
    verify_ownership(chain, world)
    w = chain.contract.get_work(1)
    assert w["ownership"] == "VERIFIED" and w["authorship_tier"] == "OWNERSHIP_VERIFIED"
    assert int(chain.contract.get_balance(KEEPER)) == REWARD
    balanced(chain.contract)


def test_token_in_comments_does_not_verify(chain, world):
    register(chain, world)
    token = chain.contract.get_work_proof(1)
    world["pages"][(PAGE, "html")] = f"<html><head></head><body><div class='comments'>{token}</div></body></html>"
    world["pages"][(PAGE, "text")] = token
    chain.as_(KEEPER).verify_work_ownership(1)
    w = chain.contract.get_work(1)
    assert w["ownership"] == "UNVERIFIED" and w["ownership_result"] == "PROOF_BODY_ONLY"
    assert w["authorship_tier"] == "UNVERIFIED_CLAIM"


def test_another_works_token_does_not_verify(chain, world):
    register(chain, world)
    world["pages"][(PAGE, "html")] = head_page(f"oar-proof:{AUTHOR}:w2")
    world["pages"][(PAGE, "text")] = "x"
    chain.as_(KEEPER).verify_work_ownership(1)
    assert chain.contract.get_work(1)["ownership"] == "UNVERIFIED"


def test_failed_check_respects_cooldown(chain, world):
    register(chain, world)
    world["pages"][(PAGE, "html")] = "<html><head></head><body>nothing</body></html>"
    world["pages"][(PAGE, "text")] = "nothing"
    chain.as_(KEEPER).verify_work_ownership(1)
    try:
        chain.as_(KEEPER).verify_work_ownership(1)
        assert False, "second check inside the cooldown must be refused"
    except Exception as e:
        assert "wait" in str(e).lower()


# ---------------------------------------------------------------- dispute: upheld

def open_dispute(chain, world, chal_stamp="20190101000000", work_stamp=None, sim="IDENTICAL"):
    c = chain.contract
    cwid = register_challenger(chain)
    prime_challenge_pages(world, c.get_work_proof(cwid), chal_stamp, work_stamp, sim)
    chain.at(T0)
    chain.as_(CHAL, STAKE).open_dispute(1, cwid, EARLY, "This page copies my older article.")
    return 1


def test_upheld_dispute_stake_distribution_and_withdrawal(chain, world):
    register(chain, world)
    chain.as_(OTHER, REWARD * 4).fund_rewards()
    verify_ownership(chain, world)
    open_dispute(chain, world)
    chain.at(T_DAY5)
    chain.as_(KEEPER).resolve_dispute(1)
    c = chain.contract
    d = c.get_dispute(1)
    assert d["status"] == "UPHELD" and d["outcome_code"] == "CHALLENGER_FIRST"
    assert d["challenger_date_basis"] == "ARCHIVE"
    assert c.get_work(1)["status"] == "OVERTURNED"
    first = c.get_first_author(PAGE)
    assert first["first_author"] == CHAL and first["overturned"]
    # challenger: stake back + 50% of the author's bond; keeper (resolver) earns the resolver reward
    assert int(c.get_balance(CHAL)) == STAKE + BOND // 2
    balanced(c)
    chain.as_(CHAL).withdraw()
    assert (CHAL, STAKE + BOND // 2) in chain.transfers
    assert int(c.get_balance(CHAL)) == 0
    balanced(c)


def test_winner_of_upheld_dispute_is_established(chain, world):
    register(chain, world)
    open_dispute(chain, world)
    chain.at(T_DAY5)
    chain.as_(KEEPER).resolve_dispute(1)
    winner = chain.contract.get_first_author(PAGE)
    assert winner["authorship_tier"] == "ESTABLISHED"


def test_self_declared_backdating_cannot_win_money(chain, world):
    """The challenger's live page claims 2001 in metadata, but no archive capture exists."""
    register(chain, world)
    c = chain.contract
    register_challenger(chain)
    token = c.get_work_proof(2)
    world["pages"][(EARLY, "html")] = head_page(token).replace("<body>", '<meta property="article:published_time" content="2001-01-01"><body>')
    world["pages"][(EARLY, "text")] = "old original text"
    world["pages"][(PAGE, "text")] = "old original text"
    world["llm"] = {"similarity": "IDENTICAL", "evidence_status": "NOT_PROVIDED"}
    chain.at(T0)
    chain.as_(CHAL, STAKE).open_dispute(1, 2, EARLY, "This page copies my older article.")
    chain.at(T_DAY5)
    chain.as_(KEEPER).resolve_dispute(1)
    d = c.get_dispute(1)
    assert d["status"] == "OPEN" and d["outcome_code"] == "CHALLENGER_DATE_UNKNOWN"
    assert c.get_work(1)["status"] == "UNDER_DISPUTE"
    balanced(c)


# ---------------------------------------------------------------- dispute: rejected

def test_rejected_dispute_pays_author_and_blocks_relitigation(chain, world):
    register(chain, world)
    open_dispute(chain, world, chal_stamp="20190101000000", work_stamp="20170101000000")
    chain.at(T_DAY5)
    chain.as_(KEEPER).resolve_dispute(1)
    c = chain.contract
    d = c.get_dispute(1)
    assert d["status"] == "REJECTED" and d["outcome_code"] == "CHALLENGER_PUBLISHED_LATER"
    assert int(c.get_balance(AUTHOR)) == STAKE * 6000 // 10000
    assert c.get_work(1)["status"] == "ACTIVE" and c.get_work(1)["disputes_survived"] == 1
    balanced(c)
    chain.as_(AUTHOR).withdraw()
    assert (AUTHOR, STAKE * 6000 // 10000) in chain.transfers
    balanced(c)
    try:
        chain.at(T_DAY7)
        chain.as_(CHAL, STAKE).open_dispute(1, 2, EARLY, "Trying the same thing again please.")
        assert False
    except Exception as e:
        assert "already lost" in str(e).lower()


def test_unverified_author_who_defends_stays_unverified(chain, world):
    register(chain, world)
    open_dispute(chain, world, work_stamp="20170101000000")
    chain.at(T_DAY5)
    chain.as_(KEEPER).resolve_dispute(1)
    assert chain.contract.get_work(1)["authorship_tier"] == "UNVERIFIED_CLAIM"


def test_verified_author_who_defends_becomes_established(chain, world):
    register(chain, world)
    verify_ownership(chain, world)
    open_dispute(chain, world, work_stamp="20170101000000")
    chain.at(T_DAY5)
    chain.as_(KEEPER).resolve_dispute(1)
    assert chain.contract.get_work(1)["authorship_tier"] == "ESTABLISHED"


# ---------------------------------------------------------------- dispute: inconclusive and withdrawn

def test_three_inconclusive_rounds_close_and_refund_minus_fee(chain, world):
    register(chain, world)
    c = chain.contract
    register_challenger(chain)
    prime_challenge_pages(world, c.get_work_proof(2), sim="UNDETERMINED")
    chain.at(T0)
    chain.as_(CHAL, STAKE).open_dispute(1, 2, EARLY, "This page copies my older article.")
    for t in ("2026-09-26T10:00:00Z", "2026-09-27T11:00:00Z", "2026-09-28T12:00:00Z"):
        chain.at(t)
        chain.as_(KEEPER).resolve_dispute(1)
    d = c.get_dispute(1)
    assert d["status"] == "CLOSED_INCONCLUSIVE"
    fee = STAKE * 1000 // 10000
    assert int(c.get_balance(CHAL)) == STAKE - fee
    balanced(c)


def test_withdrawn_dispute_keeps_fee(chain, world):
    register(chain, world)
    open_dispute(chain, world)
    chain.as_(CHAL).withdraw_dispute(1)
    fee = STAKE * 1000 // 10000
    assert int(chain.contract.get_balance(CHAL)) == STAKE - fee
    assert chain.contract.get_work(1)["status"] == "ACTIVE"
    balanced(chain.contract)


# ---------------------------------------------------------------- adversarial inputs

def test_cannot_dispute_own_work(chain, world):
    register(chain, world)
    try:
        chain.as_(AUTHOR, STAKE).open_dispute(1, 2, EARLY, "Disputing my own work for fun.")
        assert False
    except Exception as e:
        assert "own work" in str(e)


def test_url_canonicalization_blocks_duplicate_registration(chain, world):
    register(chain, world)
    for variant in ("https://WWW.author.example/post/", "http://author.example/post?utm_source=x#frag", "https://author.example//post"):
        try:
            chain.as_(OTHER, BOND).register_work(variant, "Dup", "POST", "")
            assert False, variant
        except Exception as e:
            assert "already registered" in str(e)


def test_bad_urls_are_refused(chain, world):
    for bad in ("http://127.0.0.1/x", "https://user:pw@author.example/x", "https://bit.ly/abc", "https://localhost/x", "https://author.example:8080/x", "ftp://author.example/x"):
        try:
            chain.as_(OTHER, BOND).register_work(bad, "Bad", "POST", "")
            assert False, bad
        except Exception as e:
            assert "[EXPECTED]" in str(e), bad


def test_underfunded_bond_and_stake_are_refused(chain, world):
    try:
        chain.as_(AUTHOR, BOND - 1).register_work(PAGE, "t", "POST", "")
        assert False
    except Exception as e:
        assert "bond" in str(e).lower()
    register(chain, world)
    try:
        chain.as_(CHAL, STAKE - 1).open_dispute(1, 2, EARLY, "Not enough stake attached here.")
        assert False
    except Exception as e:
        assert "stake" in str(e).lower()


def test_withdraw_with_nothing_pending_fails_and_double_withdraw_fails(chain, world):
    try:
        chain.as_(OTHER).withdraw()
        assert False
    except Exception as e:
        assert "nothing" in str(e).lower()
    register(chain, world)
    open_dispute(chain, world)
    chain.as_(CHAL).withdraw_dispute(1)
    chain.as_(CHAL).withdraw()
    try:
        chain.as_(CHAL).withdraw()
        assert False
    except Exception as e:
        assert "nothing" in str(e).lower()
    balanced(chain.contract)


def test_blacklisted_address_cannot_register_or_challenge(chain, world):
    c = chain.contract
    admin = "0x" + "01" * 20
    chain.as_(admin).blacklist_address(OTHER, "spam")
    try:
        chain.as_(OTHER, BOND).register_work(PAGE, "t", "POST", "")
        assert False
    except Exception as e:
        assert "blacklisted" in str(e).lower()
    try:
        chain.as_(CHAL).blacklist_address(OTHER, "not admin")
        assert False
    except Exception as e:
        assert "admin" in str(e).lower()
