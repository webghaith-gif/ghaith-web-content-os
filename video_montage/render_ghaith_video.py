#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

FPS = 30
WIDTH = 1080
HEIGHT = 1920
TRANSITION = 0.25
OUTPUT_NAME = "Ghaith_Web_First_Week_AI_FINAL.mp4"
AUDIO_URL = "https://resource2.heygen.ai/text_to_speech/fd02b5e37554435e9a4ae15a7950041c/cfa6efa1cb9b46abb1dc7fb128d5622f/id=125334bb-a78b-4e08-8aab-a4702ea8e507.wav"

# الصور المعتمدة فقط — لوحات التجميع مستبعدة عمدًا.
ORDER = [
    "planification_éducative_intelligente_au_bureau.png",
    "planification_éducative_intelligente_et_créative.png",
    "les_tâches_s_accumulent_avant_la_rentrée_scolaire.png",
    "infographie_arabe_planifier_sa_première_semaine.png",
    "الذكاء_الاصطناعي_يبني_مسودة_الدرس.png",
    "مراجعة_الخطة_الأسبوعية_بتركيز.png",
    "planificateur_hebdomadaire_pour_enseignants.png",
    "planification_pédagogique_intelligente_au_bureau.png",
    "affiche_de_planification_pédagogique_avec_chatgpt.png",
]

# وقت نسبي أطول قليلًا للصور الغنية بالنص، ثم يُضبط تلقائيًا على مدة الصوت.
WEIGHTS = [1.00, 1.10, 1.10, 1.25, 1.10, 1.10, 1.05, 1.00, 1.15]

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
WORK = ROOT / ".render_work"
OUT = ROOT / "output"
AUDIO = ASSETS / "voice_final.wav"


def run(cmd: list[str]) -> None:
    print("\n$", " ".join(cmd))
    subprocess.run(cmd, check=True)


def require_tool(name: str) -> None:
    if shutil.which(name) is None:
        raise SystemExit(
            f"Missing {name}. In Codespaces run:\n"
            "sudo apt-get update && sudo apt-get install -y ffmpeg"
        )


def audio_duration(path: Path) -> float:
    out = subprocess.check_output([
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", str(path)
    ], text=True)
    data = json.loads(out)
    return float(data["format"]["duration"])


def download_audio() -> None:
    if AUDIO.exists():
        return
    ASSETS.mkdir(parents=True, exist_ok=True)
    print("Downloading approved final voice…")
    urllib.request.urlretrieve(AUDIO_URL, AUDIO)


def find_images() -> list[Path]:
    exact = [ASSETS / name for name in ORDER]
    if all(p.exists() for p in exact):
        return exact

    # بديل: 01.png … 09.png أو أي 9 PNG/JPG مرتبة بالاسم.
    candidates = sorted(
        [p for p in ASSETS.iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}]
    ) if ASSETS.exists() else []
    if len(candidates) != 9:
        missing = [p.name for p in exact if not p.exists()]
        raise SystemExit(
            "Need exactly 9 approved images in video_montage/assets/.\n"
            "Either keep the original names or rename them 01.png … 09.png.\n"
            f"Missing original names: {missing}"
        )
    return candidates


def make_clip(image: Path, duration: float, idx: int) -> Path:
    clip = WORK / f"clip_{idx:02d}.mp4"
    frames = max(1, round(duration * FPS))

    # حركة دقيقة جدًا للحفاظ على النص العربي: 1.0 → 1.018 فقط.
    if idx % 2 == 0:
        zoom = f"min(1.0+0.018*on/{frames},1.018)"
    else:
        zoom = f"max(1.018-0.018*on/{frames},1.0)"

    vf = (
        f"scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=decrease,"
        f"pad={WIDTH}:{HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=0xF7F5F0,"
        f"zoompan=z='{zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
        f"d=1:s={WIDTH}x{HEIGHT}:fps={FPS},"
        "setsar=1,format=yuv420p"
    )

    run([
        "ffmpeg", "-y", "-loop", "1", "-framerate", str(FPS),
        "-i", str(image), "-t", f"{duration:.3f}",
        "-vf", vf, "-an", "-c:v", "libx264", "-crf", "18",
        "-preset", "medium", "-pix_fmt", "yuv420p", str(clip)
    ])
    return clip


def xfade_clips(clips: list[Path], durations: list[float]) -> Path:
    merged = WORK / "video_no_audio.mp4"
    cmd = ["ffmpeg", "-y"]
    for clip in clips:
        cmd += ["-i", str(clip)]

    chains = []
    prev = "0:v"
    cumulative = durations[0]
    for i in range(1, len(clips)):
        out = f"v{i}"
        offset = cumulative - TRANSITION * i
        chains.append(
            f"[{prev}][{i}:v]xfade=transition=fade:duration={TRANSITION}:"
            f"offset={offset:.3f}[{out}]"
        )
        prev = out
        cumulative += durations[i]

    cmd += [
        "-filter_complex", ";".join(chains),
        "-map", f"[{prev}]", "-an", "-c:v", "libx264", "-crf", "18",
        "-preset", "medium", "-pix_fmt", "yuv420p", str(merged)
    ]
    run(cmd)
    return merged


def mux_audio(video: Path) -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    final = OUT / OUTPUT_NAME
    run([
        "ffmpeg", "-y", "-i", str(video), "-i", str(AUDIO),
        "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k", "-shortest",
        "-movflags", "+faststart", str(final)
    ])
    return final


def main() -> None:
    require_tool("ffmpeg")
    require_tool("ffprobe")
    download_audio()
    images = find_images()
    duration = audio_duration(AUDIO)

    # لأن كل xfade يختصر التايملاين، نضيف زمن التداخل إلى مجموع مدد الصور.
    target_sum = duration + TRANSITION * (len(images) - 1)
    total_w = sum(WEIGHTS)
    durations = [target_sum * w / total_w for w in WEIGHTS]

    WORK.mkdir(parents=True, exist_ok=True)
    print(f"Audio duration: {duration:.3f}s")
    print("Images:")
    for i, (img, d) in enumerate(zip(images, durations), 1):
        print(f"  {i}. {img.name} — {d:.2f}s")

    clips = [make_clip(img, d, i) for i, (img, d) in enumerate(zip(images, durations), 1)]
    silent = xfade_clips(clips, durations)
    final = mux_audio(silent)
    print("\nDONE:", final)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        print(f"\nRender failed with exit code {e.returncode}", file=sys.stderr)
        raise
