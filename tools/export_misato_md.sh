#!/bin/bash
#SBATCH --job-name=misato_md_export
#SBATCH --partition=cbio-cpu
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --time=01:00:00
#SBATCH --mem=16000
#SBATCH --output=/cluster/CBIO/home/vgertner/md_out/%x_%j.log

set -euo pipefail
source /cluster/CBIO/home/vgertner/.bashrc
conda activate atomsurf
REPO_ROOT=/cluster/CBIO/data2/vgertner/alphasurf/alphasurf
export PYTHONPATH="$REPO_ROOT:$REPO_ROOT/cgal_alpha_bindings/build:${PYTHONPATH:-}"

python /cluster/CBIO/home/vgertner/export_misato_md.py \
    --md-path "$REPO_ROOT/data/misato/MD.hdf5" \
    --out-dir /cluster/CBIO/home/vgertner/md_out \
    "$@"
