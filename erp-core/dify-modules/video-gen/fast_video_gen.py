"""Fast video generation using FFmpeg filters instead of per-frame processing."""

import os
import sys
import json
import subprocess
import tempfile
import requests

FONT_PATH = "/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf"

def download_image(url: str, output_path: str) -> str:
    r = requests.get(url, timeout=30)
    with open(output_path, "wb") as f:
        f.write(r.content)
    return output_path

def add_text_overlay_fast(image_path: str, text: str, output_path: str) -> str:
    """Add text overlay using FFmpeg drawtext filter."""
    escaped_text = text.replace("'", "\\'").replace(":", "\\:")
    cmd = [
        "ffmpeg", "-y",
        "-i", image_path,
        "-vf", f"drawtext=text='{escaped_text}':fontfile={FONT_PATH}:fontsize=48:fontcolor=white:x=(w-text_w)/2:y=h-th-100:box=1:boxcolor=black@0.7:boxborderw=20",
        "-q:v", "3",
        output_path
    ]
    subprocess.run(cmd, capture_output=True, check=True)
    return output_path

def generate_video_fast(image_path: str, output_path: str, duration: float = 5.0, tts_text: str = None) -> str:
    """Generate video using FFmpeg zoompan filter (much faster than per-frame)."""
    # Step 1: Create video with zoompan effect
    temp_video = output_path + ".temp.mp4"
    
    # zoompan: z='if(eq(on,1),1,zoom+0.002)':d=25*5
    fps = 10  # Lower FPS for faster generation
    total_frames = int(duration * fps)
    zoom_rate = 0.15 / total_frames  # 15% zoom over duration
    
    cmd = [
        "ffmpeg", "-y",
        "-loop", "1",
        "-i", image_path,
        "-vf", f"zoompan=z='if(eq(on,1),1,min(zoom+{zoom_rate},1.15))':d={total_frames}:fps={fps}:s=1080x1920",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-t", str(duration),
        "-pix_fmt", "yuv420p",
        temp_video
    ]
    subprocess.run(cmd, capture_output=True, check=True, timeout=30)
    
    # Step 2: Add TTS if provided
    if tts_text:
        temp_audio = output_path + ".temp.mp3"
        # Use edge-tts or gtts
        try:
            subprocess.run([
                sys.executable, "-m", "edge_tts",
                "--text", tts_text,
                "--voice", "th-TH-PremwadeeNeural",
                "--write-media", temp_audio
            ], capture_output=True, check=True, timeout=30)
        except Exception:
            # Fallback to gtts
            try:
                from gtts import gTTS
                tts = gTTS(tts_text, lang="th")
                tts.save(temp_audio)
            except Exception as e:
                # No audio, just return video
                os.replace(temp_video, output_path)
                return output_path
        
        # Combine video and audio
        cmd = [
            "ffmpeg", "-y",
            "-i", temp_video,
            "-i", temp_audio,
            "-c:v", "copy",
            "-c:a", "aac",
            "-shortest",
            output_path
        ]
        subprocess.run(cmd, capture_output=True, check=True, timeout=30)
        
        # Cleanup temp files
        for f in [temp_audio]:
            if os.path.exists(f):
                os.remove(f)
    else:
        os.replace(temp_video, output_path)
    
    return output_path

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("image_url")
    parser.add_argument("--text", "-t", default="")
    parser.add_argument("--tts", default="")
    parser.add_argument("--duration", type=float, default=5.0)
    parser.add_argument("-o", "--output", default="/tmp/fast_video.mp4")
    args = parser.parse_args()
    
    img_path = "/tmp/fast_input.jpg"
    download_image(args.image_url, img_path)
    
    if args.text:
        text_img = "/tmp/fast_text.jpg"
        add_text_overlay_fast(img_path, args.text, text_img)
        img_path = text_img
    
    generate_video_fast(img_path, args.output, args.duration, args.tts)
    print(json.dumps({"status": "ok", "video_path": args.output}))
