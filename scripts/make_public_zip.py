#!/usr/bin/env python3
import os, sys, zipfile, argparse

def should_skip(root, rel):
  parts = rel.split(os.sep)
  if parts[0] in ("tools","_legacy"):  # no empaquetar backend ni legacy
    return True
  return False

def make_zip(public_dir, out_zip):
  if not os.path.isdir(public_dir):
    raise SystemExit(f"Carpeta no encontrada: {public_dir}")
  with zipfile.ZipFile(out_zip, "w", compression=zipfile.ZIP_DEFLATED) as z:
    for r, _, files in os.walk(public_dir):
      for f in files:
        absf = os.path.join(r, f)
        rel = os.path.relpath(absf, public_dir)
        if should_skip(public_dir, rel): continue
        z.write(absf, arcname=os.path.join("public", rel))
  return out_zip

def main():
  ap = argparse.ArgumentParser(description="Empaqueta public/ en public.zip (excluye public/tools y public/_legacy)")
  ap.add_argument("--public", default="public")
  ap.add_argument("--out", default="public.zip")
  args = ap.parse_args()
  out = make_zip(args.public, args.out)
  print(f"OK → {out}")

if __name__ == "__main__":
  main()
