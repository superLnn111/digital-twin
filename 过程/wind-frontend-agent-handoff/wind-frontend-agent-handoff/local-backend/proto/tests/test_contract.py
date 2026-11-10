"""Black-box contracts: serial bytes -> independent segments -> exact frames."""

from compression import zstd
from pathlib import Path
import tempfile
import unittest

from wind_proto import (Frame, Parser, Quality, SegmentBuilder, load_segment,
                        publish_segment, read_register, register_value, six_axis)

ATTITUDE = bytes.fromhex("55550106000000000000b1")
SIX_AXIS = bytes.fromhex("5555030c010002000300040005000600ce")


class ContractTests(unittest.TestCase):
    def test_every_input_split_preserves_frames_and_counts(self):
        bad = SIX_AXIS[:-1] + b"\x00"
        source = b"noise" + ATTITUDE + bad + SIX_AXIS + b"\x55\x55\x03"
        for split in range(len(source) + 1):
            with self.subTest(split=split):
                parser = Parser()
                found = parser.feed(source[:split], 100, 200)
                found += parser.feed(source[split:], 300, 400)
                parser.finish()
                self.assertEqual([f.raw for f in found], [ATTITUDE, SIX_AXIS])
                self.assertEqual(parser.quality, Quality(
                    checksum_errors=1, discarded_bytes=5 + len(bad), incomplete_bytes=3))

    def test_complete_frame_uses_read_that_finished_it(self):
        parser = Parser()
        self.assertEqual(parser.feed(SIX_AXIS[:9], 10, 20), [])
        self.assertEqual(parser.feed(SIX_AXIS[9:], 30, 40), [Frame(30, 40, SIX_AXIS)])

    def test_segments_are_independent_and_pending_tail_stays_in_ram(self):
        parser = Parser()
        with tempfile.TemporaryDirectory() as directory:
            first = SegmentBuilder("pi", "ch0", "experiment")
            for frame in parser.feed(ATTITUDE + SIX_AXIS[:8], 10, 20):
                first.append(frame)
            first_path = Path(directory) / "first.wind.zst"
            publish_segment(first_path, first.seal())
            second = SegmentBuilder("pi", "ch0", "experiment")
            for frame in parser.feed(SIX_AXIS[8:], 30, 40):
                second.append(frame)
            second_path = Path(directory) / "second.wind.zst"
            publish_segment(second_path, second.seal())
            self.assertEqual(list(load_segment(second_path).frames()), [Frame(30, 40, SIX_AXIS)])
            self.assertEqual(list(load_segment(first_path).frames()), [Frame(10, 20, ATTITUDE)])
            self.assertEqual(parser.pending_bytes, 0)

    def test_standard_zstd_roundtrip_retains_quality_and_utc_rollback(self):
        builder = SegmentBuilder("pi", "ch0", "exp", "legacy_frame_acceptance")
        expected = [Frame(200, 1, ATTITUDE), Frame(100, 2, SIX_AXIS)]
        for frame in expected:
            builder.append(frame)
        quality = Quality(4, 2, 30, 3)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.wind.zst"
            publish_segment(path, builder.seal(quality))
            self.assertIn(ATTITUDE, zstd.decompress(path.read_bytes()))
            segment = load_segment(path)
            segment.validate()
            self.assertEqual(list(segment.frames()), expected)
            self.assertEqual(segment.header["quality"], quality.as_dict())
            self.assertEqual((segment.header["start_utc_ns"], segment.header["end_utc_ns"]), (100, 200))

    def test_invalid_frames_and_clock_reset_are_rejected(self):
        builder = SegmentBuilder("pi", "ch0", "exp")
        for raw in (b"noise", SIX_AXIS[:-1], SIX_AXIS[:-1] + b"\x00"):
            with self.assertRaises(ValueError):
                builder.append(Frame(1, 1, raw))
        builder.append(Frame(1, 2, ATTITUDE))
        with self.assertRaises(ValueError):
            builder.append(Frame(1, 1, ATTITUDE))
        self.assertEqual(builder.count, 1)

    def test_large_stream_and_unknown_valid_message(self):
        unknown = bytes.fromhex("55557e01234c")
        parser = Parser()
        frames = parser.feed((ATTITUDE + SIX_AXIS) * 10000 + unknown, 1, 2)
        self.assertEqual(len(frames), 20001)
        self.assertEqual(frames[-1].raw, unknown)
        self.assertEqual(parser.quality, Quality())

    def test_publication_refuses_existing_files_and_leaves_tails(self):
        segment = SegmentBuilder("pi", "ch0", "exp").seal(Quality(discarded_bytes=8))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "segment.wind.zst"
            tail = path.with_name(path.name + ".tmp")
            tail.write_bytes(b"interrupted")
            with self.assertRaises(FileExistsError):
                publish_segment(path, segment)
            self.assertEqual(tail.read_bytes(), b"interrupted")
            other = Path(directory) / "other.wind.zst"
            publish_segment(other, segment)
            original = other.read_bytes()
            with self.assertRaises(FileExistsError):
                publish_segment(other, segment)
            self.assertEqual(other.read_bytes(), original)
            load_segment(other).validate()

    def test_truncated_and_corrupt_compression_is_rejected(self):
        builder = SegmentBuilder("pi", "ch0", "exp")
        builder.append(Frame(1, 2, SIX_AXIS))
        compressed = builder.seal().compressed()
        with tempfile.TemporaryDirectory() as directory:
            for name, data in [("truncated", compressed[:-1]),
                               ("bad-checksum", compressed[:-1] + bytes([compressed[-1] ^ 1]))]:
                path = Path(directory) / name
                path.write_bytes(data)
                with self.assertRaises((ValueError, zstd.ZstdError, EOFError)):
                    load_segment(path)

    def test_checksumless_and_concatenated_frames_are_not_this_format(self):
        builder = SegmentBuilder("pi", "ch0", "exp")
        builder.append(Frame(1, 2, SIX_AXIS))
        compressed = builder.seal().compressed()
        unchecked = zstd.compress(zstd.decompress(compressed))
        with tempfile.TemporaryDirectory() as directory:
            for index, data in enumerate((unchecked, compressed + compressed)):
                path = Path(directory) / str(index)
                path.write_bytes(data)
                with self.assertRaises(ValueError):
                    load_segment(path)

    def test_read_only_register_and_unscaled_values(self):
        self.assertEqual(read_register("ACCFSR"), bytes.fromhex("55af84010089"))
        self.assertEqual(register_value(bytes.fromhex("55af8401028b")), (4, 2))
        with self.assertRaises(ValueError):
            register_value(bytes.fromhex("55af84010200"))
        self.assertEqual(six_axis(SIX_AXIS), (1, 2, 3, 4, 5, 6))


if __name__ == "__main__":
    unittest.main()
