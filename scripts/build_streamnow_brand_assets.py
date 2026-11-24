"""Produce transparent, conservative derived assets from the approved raster crops.
No re-lettering or redrawing.  The untouched originals retain canonical authority.
This is not a vector conversion; HD source should replace raster crops when committed.
"""
from pathlib import Path
from PIL import Image
import sys

def derive(src, dest, scale=2):
    image=Image.open(src).convert("RGB")
    # Crop already contains approved artwork on near-black. Strip the black
    # background rather than adding a black rectangle around the brand.
    pixels=image.load()
    out=Image.new("RGBA", image.size, (0,0,0,0))
    target=out.load()
    for y in range(image.height):
        for x in range(image.width):
            r,g,b=pixels[x,y]
            v=max(r,g,b)
            alpha=round(max(0,min(255,(v-27)*255/65)))
            target[x,y]=(r,g,b,alpha)
    if scale>1:
        out=out.resize((out.width*scale,out.height*scale),Image.Resampling.LANCZOS)
    # Avoid nearest-neighbor pixelation; WebP is bounded for TV loading.
    out.save(dest,format="WEBP",quality=95,method=6)
    check=Image.open(dest)
    if check.mode!="RGBA" or check.getextrema()[3][0]!=0:
        raise RuntimeError("Alpha transparency was not preserved")

def main():
    root=Path(sys.argv[1] if len(sys.argv)>1 else "site")
    derive(root/"streamnow-brand.webp",root/"streamnow-brand-clean.webp")
    derive(root/"streamnow-icon.webp",root/"streamnow-icon-clean.webp")
    print("Stream Now: derived transparent RGBA assets created; source originals untouched")

if __name__=="__main__":
    main()
