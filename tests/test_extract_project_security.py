"""Security regression for structured project dump extraction."""

import tempfile
import unittest
from pathlib import Path

from extract_project import extract_files


def entry(path: str, content: str) -> str:
    return f"{'=' * 16}\nFile: {path}\n{'=' * 16}\n{content}\n"


class ExtractionSecurityTests(unittest.TestCase):
    def test_prevents_traversal_and_preserves_originals(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            out = root / "out"
            out.mkdir()
            original = out / "preserve.txt"
            original.write_text("original", encoding="utf-8")
            outside = root / "outside"
            outside.mkdir()
            (out / "linked").symlink_to(outside, target_is_directory=True)
            archive = root / "dump.txt"
            archive.write_text(
                entry("safe/nested.txt", "safe")
                + entry("../escape.txt", "bad")
                + entry("linked/escape.txt", "bad")
                + entry("C:\\windows\\file.txt", "bad")
                + entry("preserve.txt", "overwrite"),
                encoding="utf-8",
            )
            created, skipped = extract_files(archive, out)
            self.assertEqual(created, ["safe/nested.txt"])
            self.assertEqual(len(skipped), 4)
            self.assertEqual((out / "safe" / "nested.txt").read_text(encoding="utf-8"), "safe")
            self.assertEqual(original.read_text(encoding="utf-8"), "original")
            self.assertFalse((root / "escape.txt").exists())
            self.assertFalse((outside / "escape.txt").exists())


if __name__ == "__main__":
    unittest.main()
