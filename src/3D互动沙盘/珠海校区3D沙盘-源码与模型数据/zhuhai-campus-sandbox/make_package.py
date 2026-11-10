"""Package version 4.0/r4 inputs and separated QA; updated 2026-11-03.

Run only after the final r4 build and QA are complete.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent
required_files = [
    'README.md', 'shell.html', 'style.css', 'utils.js', 'world.js',
    'world-extra.js', 'campus-roads.js', 'campus-road-design.js',
    'campus-specials.js', 'campus-sites.js', 'campus-turbines.js',
    'campus-landscape.js', 'app.js', 'build.cjs',
    'apply-revisions.cjs', 'make_package.py',
    'vendor/three.min.js', 'vendor/LICENSE-THREE.txt',
    'data/building-footprints.json', 'data/campus-revisions.json',
    'data/terrain-triangulation.json', 'data/generate_terrain_triangulation.py',
    'data/road-surfaces.json', 'data/road-design.json', 'data/generate_road_design.py',
    'data/roads-mask.png', 'data/FOOTPRINTS-README.md',
    'data/footprint-validation.json', 'data/terrain-triangulation-validation.json',
    'assets/plan-reference.jpg', 'assets/aerial-reference.jpg',
    'assets/observatory-reference.jpg', 'assets/forest-mask.json',
    'assets/road-distance.json', 'reference/landmarks.json',
    'reference/interpretation.md', 'reference/video-reference.json',
    'reference/video-reference-report.txt',
    'qa-r4.cjs', 'qa/r4-report.json', 'qa-terrain-profile.cjs',
    'qa-final-smoke.cjs', 'qa/final-smoke.json',
]

# Keep historical v1/r2/r3 QA separate from current r4 checks.
# Old position-annotation screenshots and task-local Python deps are not bundled.
optional_files = [
    ('qa/report.json', 'qa/baseline-v1/report.json'),
    ('qa/revisions-report.json', 'qa/baseline-r2/revisions-report.json'),
    ('qa/r3-report.json', 'qa/baseline-r3/r3-report.json'),
    ('qa/landmark-audit.md', 'qa/baseline-v1/landmark-audit.md'),
    ('qa/landmark-audit-evidence.json', 'qa/baseline-v1/landmark-audit-evidence.json'),
    ('qa-revisions.cjs', 'qa-revisions.cjs'),
    ('qa-r3.cjs', 'qa-r3.cjs'),
    ('data/extract_footprints.py', 'data/extract_footprints.py'),
    ('data/validate_footprints.py', 'data/validate_footprints.py'),
    ('data/correct_library_semantics.py', 'data/correct_library_semantics.py'),
]


def main():
    missing = [name for name in required_files if not (root / name).is_file()]
    if missing:
        raise FileNotFoundError('Missing package inputs: ' + ', '.join(missing))
    entries = [(name, name) for name in required_files]
    entries.extend((source, target) for source, target in optional_files
                   if (root / source).is_file())
    targets = [target for source, target in entries]
    if len(targets) != len(set(targets)):
        raise ValueError('Duplicate archive entry')
    output = root / 'outputs/珠海校区3D沙盘-源码与模型数据.zip'
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, 'w', ZIP_DEFLATED, compresslevel=7) as archive:
        for source, target in entries:
            archive.write(root / source, 'zhuhai-campus-sandbox/' + target)
    print(output)
    print(f'{len(entries)} files, {output.stat().st_size:,} bytes')


if __name__ == '__main__':
    main()
