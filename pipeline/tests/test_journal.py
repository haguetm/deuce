import json

from deuce_pipeline.journal import Journal


def test_issues_with_accents_are_written_as_utf8(tmp_path):
    journal = Journal("test", log_dir=tmp_path)
    journal.issue("no_stats", "Q1", "Barbora Krejčíková: not found")
    journal.close()
    issues = json.loads(journal.issues_path.read_text(encoding="utf-8"))
    assert issues[0]["detail"] == "Barbora Krejčíková: not found"
