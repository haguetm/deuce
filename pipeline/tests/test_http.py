import httpx
import pytest

from deuce_pipeline import http


def test_connection_reset_is_retried(monkeypatch):
    monkeypatch.setenv("PIPELINE_CONTACT", "https://example.invalid/contact")
    monkeypatch.setattr(http.time, "sleep", lambda _: None)
    calls = []

    def handler(request):
        calls.append(request)
        if len(calls) == 1:
            raise httpx.ReadError("connection reset by peer")
        return httpx.Response(200, content=b"ok")

    client = http.HttpClient(cache_dir=None, min_interval_s=0)
    client._client = httpx.Client(transport=httpx.MockTransport(handler))
    assert client.get_bytes("https://example.invalid/x") == b"ok"
    assert len(calls) == 2


def test_gives_up_with_a_dedicated_error(monkeypatch):
    monkeypatch.setenv("PIPELINE_CONTACT", "https://example.invalid/contact")
    monkeypatch.setattr(http.time, "sleep", lambda _: None)
    client = http.HttpClient(cache_dir=None, min_interval_s=0, max_retries=2)
    client._client = httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(503)))
    with pytest.raises(http.GaveUp):
        client.get_bytes("https://example.invalid/x")
