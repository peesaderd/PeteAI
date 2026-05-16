#!/usr/bin/env python3
"""
Video Gen Module — สร้างวิดีโอสำหรับ TikTok จากภาพ + ข้อความ + เสียง
ใช้ Pillow + FFmpeg + gTTS/edge-tts

Features:
  - Image + text overlay (รองรับฟอนต์ไทย)
  - Basic animation (zoom/pan)
  - Audio/TTS support
  - Export MP4 สำหรับ TikTok
"""

import os
import sys
import json
import tempfile
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# === CONFIG ===
FONT_PATH = "/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf"
FONT_BOLD_PATH = "/usr/share/fonts/truetype/noto/NotoSansThai-Bold.ttf"
OUTPUT_DIR = "/tmp/video_gen_output"
TTS_ENGINE = "edge"  # "gtts" or "edge"

# === TEXT OVERLAY ===

def add_text_overlay(
    image_path: str,
    text: str,
    output_path: str,
    font_size: int = 48,
    position: str = "bottom",
    text_color: str = "white",
    bg_color: str = "black",
    bg_opacity: int = 180,
    font_path: str = None
) -> str:
    """Add Thai text overlay to an image."""
    img = Image.open(image_path).convert("RGBA")
    font_path = font_path or FONT_PATH
    
    try:
        font = ImageFont.truetype(font_path, font_size)
    except Exception:
        font = ImageFont.load_default()
    
    # Create text overlay layer
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    
    # Get text bounding box
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    
    # Calculate position
    padding = 20
    margin = 30
    if position == "bottom":
        x = (img.width - text_w) // 2
        y = img.height - text_h - margin
    elif position == "top":
        x = (img.width - text_w) // 2
        y = margin
    elif position == "center":
        x = (img.width - text_w) // 2
        y = (img.height - text_h) // 2
    else:
        x, y = position  # custom (x, y) tuple
    
    # Draw background bar
    bar_h = text_h + padding * 2
    bar_y = y - padding
    bar = Image.new("RGBA", (img.width, bar_h), (*parse_color(bg_color), bg_opacity))
    overlay.paste(bar, (0, bar_y), bar)
    
    # Draw text
    draw = ImageDraw.Draw(overlay)
    draw.text((x, y), text, fill=parse_color(text_color), font=font)
    
    # Composite
    result = Image.alpha_composite(img, overlay)
    result = result.convert("RGB")
    result.save(output_path, quality=95)
    return output_path


def add_multi_text_overlay(
    image_path: str,
    texts: list,
    output_path: str,
    font_sizes: list = None,
    font_paths: list = None
) -> str:
    """Add multiple text overlays at different positions."""
    img = Image.open(image_path).convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    
    positions = ["top", "center", "bottom"]
    font_sizes = font_sizes or [36, 48, 36]
    font_paths = font_paths or [FONT_PATH] * len(texts)
    
    for i, text in enumerate(texts):
        fp = font_paths[i] if i < len(font_paths) else FONT_PATH
        fs = font_sizes[i] if i < len(font_sizes) else 36
        pos = positions[i] if i < len(positions) else "bottom"
        
        try:
            font = ImageFont.truetype(fp, fs)
        except Exception:
            font = ImageFont.load_default()
        
        bbox = draw.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        
        margin = 40
        if pos == "top":
            x, y = (img.width - text_w) // 2, margin
        elif pos == "center":
            x, y = (img.width - text_w) // 2, (img.height - text_h) // 2
        else:
            x, y = (img.width - text_w) // 2, img.height - text_h - margin
        
        # Semi-transparent background
        padding = 15
        draw.rectangle(
            [x - padding, y - padding, x + text_w + padding, y + text_h + padding],
            fill=(0, 0, 0, 160)
        )
        draw.text((x, y), text, fill="white", font=font)
    
    result = Image.alpha_composite(img, overlay).convert("RGB")
    result.save(output_path, quality=95)
    return output_path


def create_product_review_card(
    product_image_path: str,
    title: str,
    rating: int,
    review_text: str,
    output_path: str,
    brand: str = ""
) -> str:
    """Create a styled product review card for TikTok."""
    # Canvas size for TikTok (1080x1920)
    canvas = Image.new("RGB", (1080, 1920), "#1a1a2e")
    draw = ImageDraw.Draw(canvas)
    
    # Load product image
    try:
        product = Image.open(product_image_path).convert("RGBA")
        # Resize to fit
        max_w, max_h = 800, 800
        product.thumbnail((max_w, max_h), Image.LANCZOS)
        # Center horizontally, place in upper portion
        px = (1080 - product.width) // 2
        py = 100
        canvas.paste(product, (px, py), product if product.mode == "RGBA" else None)
    except Exception as e:
        print(f"Warning: Could not load product image: {e}")
    
    # Title
    try:
        font_title = ImageFont.truetype(FONT_BOLD_PATH, 56)
    except Exception:
        font_title = ImageFont.load_default()
    
    # Draw title with gradient-like background
    title_y = 950
    bbox = draw.textbbox((0, 0), title, font=font_title)
    tw = bbox[2] - bbox[0]
    tx = (1080 - tw) // 2
    draw.rectangle([tx - 20, title_y - 10, tx + tw + 20, title_y + 70], fill=(255, 215, 0, 200))
    draw.text((tx, title_y), title, fill="#1a1a2e", font=font_title)
    
    # Rating stars
    try:
        font_star = ImageFont.truetype(FONT_PATH, 40)
    except Exception:
        font_star = ImageFont.load_default()
    
    stars = "⭐" * rating + "☆" * (5 - rating)
    bbox = draw.textbbox((0, 0), stars, font=font_star)
    sw = bbox[2] - bbox[0]
    draw.text(((1080 - sw) // 2, title_y + 90), stars, fill="#FFD700", font=font_star)
    
    # Review text
    try:
        font_review = ImageFont.truetype(FONT_PATH, 36)
    except Exception:
        font_review = ImageFont.load_default()
    
    bbox = draw.textbbox((0, 0), review_text, font=font_review)
    rw = bbox[2] - bbox[0]
    draw.text(((1080 - rw) // 2, title_y + 160), review_text, fill="white", font=font_review)
    
    # Brand watermark
    if brand:
        try:
            font_brand = ImageFont.truetype(FONT_PATH, 28)
        except Exception:
            font_brand = ImageFont.load_default()
        draw.text((30, 1850), f"@{brand}", fill="#888888", font=font_brand)
    
    canvas.save(output_path, quality=95)
    return output_path


# === ANIMATION ===

def create_ken_burns(
    image_path: str,
    output_path: str,
    duration: float = 5.0,
    fps: int = 24,
    zoom_start: float = 1.0,
    zoom_end: float = 1.15,
    resolution: tuple = (1080, 1920)
) -> str:
    """Create Ken Burns effect (slow zoom) video from an image."""
    import numpy as np
    
    img = Image.open(image_path).convert("RGB")
    img = img.resize(resolution, Image.LANCZOS)
    
    # Create temp dir for frames
    with tempfile.TemporaryDirectory() as tmpdir:
        total_frames = int(duration * fps)
        
        for i in range(total_frames):
            progress = i / total_frames
            zoom = zoom_start + (zoom_end - zoom_start) * progress
            
            # Calculate crop region
            w, h = img.size
            new_w = int(w / zoom)
            new_h = int(h / zoom)
            left = (w - new_w) // 2
            top = (h - new_h) // 2
            
            # Crop and resize back
            frame = img.crop((left, top, left + new_w, top + new_h))
            frame = frame.resize(resolution, Image.LANCZOS)
            
            frame_path = os.path.join(tmpdir, f"frame_{i:05d}.png")
            frame.save(frame_path)
        
        # Use ffmpeg to create video
        cmd = [
            "ffmpeg", "-y",
            "-framerate", str(fps),
            "-i", os.path.join(tmpdir, "frame_%05d.png"),
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "medium",
            "-crf", "23",
            output_path
        ]
        subprocess.run(cmd, capture_output=True, check=True)
    
    return output_path


def create_pan_effect(
    image_path: str,
    output_path: str,
    duration: float = 5.0,
    fps: int = 24,
    direction: str = "right",
    resolution: tuple = (1080, 1920)
) -> str:
    """Create panning effect video from an image."""
    img = Image.open(image_path).convert("RGB")
    img = img.resize(resolution, Image.LANCZOS)
    
    with tempfile.TemporaryDirectory() as tmpdir:
        total_frames = int(duration * fps)
        
        for i in range(total_frames):
            progress = i / total_frames
            
            if direction == "right":
                shift = int(progress * (resolution[0] * 0.2))
            elif direction == "left":
                shift = -int(progress * (resolution[0] * 0.2))
            elif direction == "up":
                shift = -int(progress * (resolution[1] * 0.2))
            elif direction == "down":
                shift = int(progress * (resolution[1] * 0.2))
            else:
                shift = 0
            
            # Create shifted frame
            frame = Image.new("RGB", resolution, (0, 0, 0))
            if direction in ("right", "left"):
                frame.paste(img, (shift, 0))
            else:
                frame.paste(img, (0, shift))
            
            frame_path = os.path.join(tmpdir, f"frame_{i:05d}.png")
            frame.save(frame_path)
        
        cmd = [
            "ffmpeg", "-y",
            "-framerate", str(fps),
            "-i", os.path.join(tmpdir, "frame_%05d.png"),
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "medium",
            "-crf", "23",
            output_path
        ]
        subprocess.run(cmd, capture_output=True, check=True)
    
    return output_path


# === AUDIO / TTS ===

def generate_tts(text: str, output_path: str, lang: str = "th", engine: str = None) -> str:
    """Generate TTS audio from text."""
    engine = engine or TTS_ENGINE
    
    if engine == "gtts":
        from gtts import gTTS
        tts = gTTS(text=text, lang=lang, slow=False)
        tts.save(output_path)
    elif engine == "edge":
        import asyncio
        import edge_tts
        
        voice = "th-TH-PremwadeeNeural" if lang == "th" else "en-US-JennyNeural"
        async def _generate():
            communicate = edge_tts.Communicate(text, voice)
            await communicate.save(output_path)
        
        asyncio.run(_generate())
    
    return output_path


def add_audio_to_video(video_path: str, audio_path: str, output_path: str) -> str:
    """Add audio track to video."""
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-i", audio_path,
        "-c:v", "copy",
        "-c:a", "aac",
        "-shortest",
        output_path
    ]
    subprocess.run(cmd, capture_output=True, check=True)
    return output_path


# === FULL PIPELINE ===

def create_tiktok_video(
    image_path: str,
    text_overlays: list = None,
    tts_text: str = None,
    output_path: str = None,
    effect: str = "ken_burns",
    duration: float = 5.0,
    fps: int = 24,
    resolution: tuple = (1080, 1920)
) -> str:
    """Full pipeline: image -> text overlay -> animation -> TTS -> video."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    output_path = output_path or os.path.join(OUTPUT_DIR, "tiktok_video.mp4")
    
    # Step 1: Add text overlays
    working_img = image_path
    if text_overlays:
        for i, overlay in enumerate(text_overlays):
            if isinstance(overlay, dict):
                temp_img = os.path.join(OUTPUT_DIR, f"text_{i}.jpg")
                if "texts" in overlay:
                    working_img = add_multi_text_overlay(
                        working_img, overlay["texts"], temp_img,
                        overlay.get("font_sizes"), overlay.get("font_paths")
                    )
                else:
                    working_img = add_text_overlay(
                        working_img, overlay.get("text", ""), temp_img,
                        overlay.get("font_size", 48),
                        overlay.get("position", "bottom"),
                        overlay.get("text_color", "white"),
                        overlay.get("bg_color", "black"),
                        overlay.get("bg_opacity", 180)
                    )
    
    # Step 2: Create video with animation
    temp_video = os.path.join(OUTPUT_DIR, "temp_video.mp4")
    if effect == "ken_burns":
        create_ken_burns(working_img, temp_video, duration, fps, resolution=resolution)
    elif effect == "pan":
        create_pan_effect(working_img, temp_video, duration, fps, resolution=resolution)
    else:
        # Static video
        with tempfile.TemporaryDirectory() as tmpdir:
            img = Image.open(working_img).convert("RGB").resize(resolution, Image.LANCZOS)
            frame_path = os.path.join(tmpdir, "frame.png")
            img.save(frame_path)
            cmd = [
                "ffmpeg", "-y",
                "-loop", "1",
                "-i", frame_path,
                "-c:v", "libx264",
                "-t", str(duration),
                "-pix_fmt", "yuv420p",
                "-preset", "medium",
                "-crf", "23",
                temp_video
            ]
            subprocess.run(cmd, capture_output=True, check=True)
    
    # Step 3: Generate TTS and add to video
    if tts_text:
        temp_audio = os.path.join(OUTPUT_DIR, "temp_audio.mp3")
        generate_tts(tts_text, temp_audio)
        add_audio_to_video(temp_video, temp_audio, output_path)
    else:
        os.replace(temp_video, output_path)
    
    return output_path


# === UTILITY ===

def parse_color(color_str: str) -> tuple:
    """Parse color string to RGB tuple."""
    color_map = {
        "white": (255, 255, 255),
        "black": (0, 0, 0),
        "red": (255, 0, 0),
        "green": (0, 255, 0),
        "blue": (0, 0, 255),
        "yellow": (255, 255, 0),
        "gold": (255, 215, 0),
        "orange": (255, 165, 0),
        "purple": (128, 0, 128),
        "pink": (255, 192, 203),
        "gray": (128, 128, 128),
    }
    if color_str.lower() in color_map:
        return color_map[color_str.lower()]
    if color_str.startswith("#"):
        h = color_str.lstrip("#")
        return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
    return (255, 255, 255)


# === CLI ===

def main():
    """CLI entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Video Gen Module — สร้างวิดีโอ TikTok")
    subparsers = parser.add_subparsers(dest="command", help="คำสั่ง")
    
    # text-overlay command
    p_text = subparsers.add_parser("text-overlay", help="เพิ่มข้อความทับภาพ")
    p_text.add_argument("image", help="path to image")
    p_text.add_argument("text", help="text to overlay")
    p_text.add_argument("-o", "--output", default=None, help="output path")
    p_text.add_argument("--font-size", type=int, default=48)
    p_text.add_argument("--position", default="bottom", choices=["top", "bottom", "center"])
    
    # review-card command
    p_review = subparsers.add_parser("review-card", help="สร้างการ์ดรีวิวสินค้า")
    p_review.add_argument("product_image", help="path to product image")
    p_review.add_argument("title", help="product title")
    p_review.add_argument("--rating", type=int, default=5)
    p_review.add_argument("--review", default="สินค้าดีมาก แนะนำเลย!")
    p_review.add_argument("--brand", default="")
    p_review.add_argument("-o", "--output", default=None)
    
    # tts command
    p_tts = subparsers.add_parser("tts", help="สร้างเสียงจากข้อความ")
    p_tts.add_argument("text", help="text to speak")
    p_tts.add_argument("-o", "--output", default=None)
    p_tts.add_argument("--lang", default="th")
    p_tts.add_argument("--engine", default=TTS_ENGINE, choices=["gtts", "edge"])
    
    # video command
    p_video = subparsers.add_parser("video", help="สร้างวิดีโอ TikTok เต็มรูปแบบ")
    p_video.add_argument("image", help="path to image")
    p_video.add_argument("-t", "--text", nargs="*", help="text to display")
    p_video.add_argument("--tts", help="text for TTS")
    p_video.add_argument("-o", "--output", default=None)
    p_video.add_argument("--effect", default="ken_burns", choices=["ken_burns", "pan", "static"])
    p_video.add_argument("--duration", type=float, default=5.0)
    p_video.add_argument("--fps", type=int, default=24)
    
    args = parser.parse_args()
    
    if args.command == "text-overlay":
        output = args.output or os.path.join(OUTPUT_DIR, "text_overlay.jpg")
        os.makedirs(os.path.dirname(output) or OUTPUT_DIR, exist_ok=True)
        result = add_text_overlay(args.image, args.text, output, args.font_size, args.position)
        print(json.dumps({"status": "ok", "output": result}))
    
    elif args.command == "review-card":
        output = args.output or os.path.join(OUTPUT_DIR, "review_card.jpg")
        os.makedirs(os.path.dirname(output) or OUTPUT_DIR, exist_ok=True)
        result = create_product_review_card(args.product_image, args.title, args.rating, args.review, output, args.brand)
        print(json.dumps({"status": "ok", "output": result}))
    
    elif args.command == "tts":
        output = args.output or os.path.join(OUTPUT_DIR, "tts.mp3")
        os.makedirs(os.path.dirname(output) or OUTPUT_DIR, exist_ok=True)
        result = generate_tts(args.text, output, args.lang, args.engine)
        print(json.dumps({"status": "ok", "output": result}))
    
    elif args.command == "video":
        output = args.output or os.path.join(OUTPUT_DIR, "tiktok_video.mp4")
        os.makedirs(os.path.dirname(output) or OUTPUT_DIR, exist_ok=True)
        texts = [{"text": t, "position": "bottom"} for t in (args.text or [])]
        result = create_tiktok_video(args.image, texts, args.tts, output, args.effect, args.duration, args.fps)
        print(json.dumps({"status": "ok", "output": result}))
    
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
