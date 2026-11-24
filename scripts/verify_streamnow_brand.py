"""Production image QA for the approved canonical Stream Now artwork.
Validates the derived output only; never edits or overwrites canonical originals.
"""
from pathlib import Path
from PIL import Image
import hashlib, json, sys

SOURCE=Path(sys.argv[1] if len(sys.argv)>1 else "site")
for name,min_width in [("streamnow-brand.webp",650),("streamnow-icon.webp",260)]:
    source=SOURCE/name
    assert source.exists(),f"Missing logo file: {source}"
    image=Image.open(source).convert("RGBA")
    assert image.width>=min_width and image.height>=140, f"{name}: small {image.size}"
    alpha=image.getchannel("A")
    lo,hi=alpha.getextrema()
    assert lo==0 and hi>=230, f"{name}: no real transparent alpha ({lo},{hi})"
    # Corners of logo must not have a solid background tile.
    for p in [(0,0),(image.width-1,0),(0,image.height-1)]:
        assert alpha.getpixel(p)<=30,f"{name}: black rectangle remains at {p}"
    print(f"PASS: {name} {image.size}, RGBA transparency present")
manifest=json.loads(Path("00_CANONICO/STREAM_NOW_CANONICAL_MANIFEST_v1.json").read_text())
assert manifest["status"]=="LOCKED_REFERENCE"
assert manifest["source_assets"][0]["sha256"]=="703a88042b16208c46d7a904a82eea444fa9c2e9e3511dfa3b387482770e7186"
assert manifest["source_assets"][1]["sha256"]=="1eb23c5d10f34b2110bf12111c32f4bf577b8c0c3d970cacedab484a491008d2"
print("PASS: canonical source manifest remains frozen")
