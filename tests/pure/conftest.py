"""Stub of the `genlayer` package so the contract file can be imported in plain Python.

Only the pure, deterministic logic is exercised here (proof check, date trust, the ruling in
`_decide`, consensus binding). Anything that needs web or LLM access lives in tests/direct."""
import importlib.util
import pathlib
import sys
import types

ROOT = pathlib.Path(__file__).resolve().parents[2]


class _UserError(Exception):
    pass


def _passthrough(fn=None, **_):
    return fn if fn is not None else (lambda f: f)


class _Deco:
    def __call__(self, fn=None):
        return fn if fn is not None else (lambda f: f)

    def __getattr__(self, _):
        return _Deco()


def _build_stub():
    gl = types.SimpleNamespace()
    gl.Contract = object
    gl.public = types.SimpleNamespace(write=_Deco(), view=_Deco())
    gl.public.write.payable = _Deco()
    class _FakePayee:
        def __init__(self, address):
            self.address = address

        def emit_transfer(self, value=0):
            gl.WORLD["transfers"].append((self.address, int(value)))

    gl.evm = types.SimpleNamespace(contract_interface=lambda c: _FakePayee)
    gl.storage = types.SimpleNamespace(inmem_allocate=lambda _t, init: list(init))
    gl.message = types.SimpleNamespace(sender_address="0xsender", value=0)
    class _Return:
        def __init__(self, calldata):
            self.calldata = calldata

    def _run_nondet_unsafe(produce, validate):
        leader_value = produce()
        assert validate(_Return(leader_value)), "a validator re-running the same inputs must accept the leader"
        return leader_value

    gl.vm = types.SimpleNamespace(UserError=_UserError, Return=_Return, run_nondet_unsafe=_run_nondet_unsafe)
    gl.eq_principle = types.SimpleNamespace(strict_eq=lambda fn: fn())
    gl.message_raw = {"datetime": "2026-09-21T10:00:00Z"}
    gl.WORLD = {"pages": {}, "llm": {}, "prompts": [], "transfers": []}

    def _render(url, mode="text"):
        key = (url, mode)
        if key in gl.WORLD["pages"]:
            return gl.WORLD["pages"][key]
        raise RuntimeError("fetch failed")

    def _exec_prompt(prompt, response_format="json"):
        gl.WORLD["prompts"].append(prompt)
        return gl.WORLD["llm"]

    gl.nondet = types.SimpleNamespace(web=types.SimpleNamespace(render=_render), exec_prompt=_exec_prompt)
    mod = types.ModuleType("genlayer")
    mod.gl = gl
    mod._gl = gl
    mod.u256 = int
    mod.Address = str
    mod.allow_storage = lambda c: c
    mod.TreeMap = {}
    mod.DynArray = {}
    class _Sub:
        def __getitem__(self, _):
            return dict
    mod.TreeMap = _Sub()
    mod.DynArray = _Sub()
    return mod


def load_contract():
    sys.modules["genlayer"] = _build_stub()
    spec = importlib.util.spec_from_file_location("authorship_registry", ROOT / "src/contract/AuthorshipRegistry.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


import pytest


@pytest.fixture(scope="session")
def C():
    return load_contract()


@pytest.fixture()
def world(C):
    import sys as _s
    gl = _s.modules["genlayer"]._gl
    gl.WORLD["pages"].clear(); gl.WORLD["llm"] = {}; gl.WORLD["prompts"].clear(); gl.WORLD["transfers"].clear()
    gl.message_raw["datetime"] = "2026-09-21T10:00:00Z"
    return gl.WORLD


@pytest.fixture()
def reg(C):
    """A contract instance with no storage; enough for the pure methods."""
    return C.AuthorshipRegistry.__new__(C.AuthorshipRegistry)


@pytest.fixture()
def chain(C, world):
    """A full contract instance backed by dict storage, with helpers to act as different wallets."""
    import sys as _s
    gl = _s.modules["genlayer"]._gl
    ADMIN = "0x" + "01" * 20
    gl.message.sender_address = ADMIN
    gl.message.value = 0
    c = C.AuthorshipRegistry()
    for name in ("works", "url_index", "author_works", "disputes", "work_disputes", "challenger_disputes",
                 "lost_pairs", "balances", "author_stats", "address_status"):
        setattr(c, name, {})

    class Chain:
        contract = c
        wallet = {}

        def as_(self, sender, value=0):
            gl.message.sender_address = sender
            gl.message.value = value
            return c

        def at(self, iso):
            gl.message_raw["datetime"] = iso

        transfers = world["transfers"]

    return Chain()
