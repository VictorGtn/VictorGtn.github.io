"""Export one MISATO MD trajectory as per-frame AlphaSurf meshes for the poster viewer.

Run on the cluster through tools/export_misato_md.sh, which sets PYTHONPATH
to the alphasurf repo and its CGAL bindings:

    sbatch export_misato_md.sh [--pdb-id 1A0Q]

Without --pdb-id, a mid-sized complex from the official test split is picked.
Writes assets/md/misato_md.json (manifest) and assets/md/misato_md.bin.
"""

from __future__ import annotations

import argparse
import json
import os

import h5py
import numpy as np

from alphasurf.protein.create_surface import pdb_to_alpha_complex
from alphasurf.tasks.misato_binding_site.preprocess import preprocess_entry

MISATO_FRAME_NS = 0.1  # MISATO stores 100 frames over 10 ns


def kabsch(P, Q):
    """Rotation R and translation t such that P @ R.T + t best matches Q."""
    pc, qc = P.mean(0), Q.mean(0)
    H = (P - pc).T @ (Q - qc)
    U, _, Vt = np.linalg.svd(H)
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    D = np.diag([1.0, 1.0, d])
    R = Vt.T @ D @ U.T
    return R, qc - pc @ R.T


def lookup(md, pdb_id):
    for key in (pdb_id, pdb_id.lower(), pdb_id.upper()):
        if key in md:
            return key
    raise KeyError(f"{pdb_id} not in MD.hdf5")


def pick_default(md, split_file, target_atoms=2200, max_candidates=300):
    with open(split_file) as fh:
        ids = [l.strip() for l in fh if l.strip()][:max_candidates]
    best, best_gap = None, None
    keys = set(md.keys())
    for pid in ids:
        key = next((k for k in (pid, pid.lower(), pid.upper()) if k in keys), None)
        if key is None:
            continue
        n = int(np.sum(np.asarray(md[key]["atoms_element"]) != 1))
        gap = abs(n - target_atoms)
        if best is None or gap < best_gap:
            best, best_gap = pid, gap
    if best is None:
        raise RuntimeError("no usable complex found in the split")
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--md-path", required=True)
    ap.add_argument("--pdb-id", default=None)
    ap.add_argument("--split-file", default=None, help="defaults to <md dir>/splits/test.txt")
    ap.add_argument("--out-dir", default="assets/md")
    ap.add_argument("--stride", type=int, default=2, help="keep every n-th MD frame")
    ap.add_argument("--alpha", type=float, default=0.0)
    ap.add_argument("--site-cutoff", type=float, default=5.0, help="Å, vertex-ligand distance for colouring")
    args = ap.parse_args()

    md = h5py.File(args.md_path, "r")
    pdb_id = args.pdb_id
    if pdb_id is None:
        split = args.split_file or os.path.join(os.path.dirname(args.md_path), "splits", "test.txt")
        pdb_id = pick_default(md, split)
    group = md[lookup(md, pdb_id)]

    item = preprocess_entry(group, cutoff=10.0)
    prot_idx = item["protein_source_index"].numpy()
    radius = item["atom_radius"].numpy().astype(np.float32)
    ca_local = item["ca_atom_index"].numpy()
    lig_start = int(item["ligand_start"])
    elements = np.asarray(group["atoms_element"])
    lig_idx = lig_start + np.flatnonzero(elements[lig_start:] != 1)

    traj = group["trajectory_coordinates"]
    n_frames = traj.shape[0]
    frame_ids = list(range(0, n_frames, max(1, args.stride)))

    ref = np.asarray(traj[0], dtype=np.float64)
    ref_ca = ref[prot_idx][ca_local]
    center = ref[prot_idx].mean(0)

    chunks, frames, offset = [], [], 0
    max_nv, radius_max = 0, 0.0

    def push(arr):
        nonlocal offset
        b = np.ascontiguousarray(arr).tobytes()
        pad = (-len(b)) % 4
        chunks.append(b + b"\0" * pad)
        start = offset
        offset += len(b) + pad
        return start

    raw = []
    for fi in frame_ids:
        X = np.asarray(traj[fi], dtype=np.float64)
        R, t = kabsch(X[prot_idx][ca_local], ref_ca)
        X = X @ R.T + t - center
        prot = X[prot_idx].astype(np.float32)
        lig = X[lig_idx].astype(np.float32)
        verts, faces = pdb_to_alpha_complex(
            pdb_path=f"{pdb_id}.pdb",
            alpha_value=args.alpha,
            atom_pos=prot,
            atom_radius=radius,
        )
        verts = np.asarray(verts, dtype=np.float32).reshape(-1, 3)
        faces = np.asarray(faces, dtype=np.int64).reshape(-1, 3)
        d2 = ((verts[:, None, :] - lig[None, :, :]) ** 2).sum(-1).min(1)
        site = (d2 <= args.site_cutoff ** 2).astype(np.uint8)
        raw.append((fi, verts, faces, site, lig))
        max_nv = max(max_nv, len(verts))
        radius_max = max(radius_max, float(np.linalg.norm(verts, axis=1).max()))
        print(f"frame {fi:3d}: {len(verts)} verts, {len(faces)} faces, {int(site.sum())} site verts")

    index_dtype = "uint16" if max_nv < 65535 else "uint32"
    for fi, verts, faces, site, lig in raw:
        frames.append({
            "index": fi,
            "time_ns": round(fi * MISATO_FRAME_NS, 3),
            "nv": int(len(verts)),
            "nf": int(len(faces)),
            "nl": int(len(lig)),
            "v_off": push(verts.astype("<f4")),
            "f_off": push(faces.astype("<u2" if index_dtype == "uint16" else "<u4")),
            "site_off": push(site),
            "lig_off": push(lig.astype("<f4")),
        })

    os.makedirs(args.out_dir, exist_ok=True)
    bin_name = "misato_md.bin"
    with open(os.path.join(args.out_dir, bin_name), "wb") as fh:
        for c in chunks:
            fh.write(c)
    manifest = {
        "pdb_id": pdb_id.lower(),
        "bin": bin_name,
        "index_dtype": index_dtype,
        "alpha": args.alpha,
        "site_cutoff": args.site_cutoff,
        "radius": round(radius_max, 3),
        "frames": frames,
    }
    with open(os.path.join(args.out_dir, "misato_md.json"), "w") as fh:
        json.dump(manifest, fh)
    print(f"{pdb_id}: {len(frames)} frames, {offset / 1e6:.2f} MB -> {args.out_dir}")


if __name__ == "__main__":
    main()
