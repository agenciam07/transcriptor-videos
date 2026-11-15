import os
import time
import tempfile
import subprocess
import base64
import logging
from pathlib import Path

import httpx
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
POLL_INTERVAL = int(os.environ.get("WORKER_POLL_INTERVAL_MS", "5000")) / 1000

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


class WorkerError(Exception):
    """Error con mensaje en español para mostrar al usuario."""


def claim_next_job():
    result = supabase.rpc("claim_next_job").execute()
    if result.data:
        return result.data[0]
    return None


def update_job_status(job_id: str, status: str, error_message: str = None):
    data = {"status": status}
    if error_message is not None:
        data["error_message"] = error_message
    supabase.table("jobs").update(data).eq("id", job_id).execute()


def _map_ytdlp_error(stderr: str) -> str:
    s = stderr.lower()
    if any(x in s for x in ["video unavailable", "private video", "has been removed", "this video is unavailable"]):
        return "El video no está disponible (privado o eliminado)."
    if any(x in s for x in ["geo", "blocked", "not available in your country", "who can watch"]):
        return "El sitio bloquea descargas desde servidores. Si es YouTube, considera usar cookies."
    return "Error al descargar el video. Inténtalo de nuevo."


def download_video(job: dict, tmp_dir: str) -> Path:
    if job["source_type"] == "link":
        url = job["source_url"]
        cmd = ["yt-dlp", "-o", f"{tmp_dir}/video.%(ext)s", "--no-playlist", url]

        cookies_b64 = os.environ.get("YT_DLP_COOKIES_B64")
        if cookies_b64:
            cookies_path = Path(tmp_dir) / "cookies.txt"
            cookies_path.write_bytes(base64.b64decode(cookies_b64))
            cmd += ["--cookies", str(cookies_path)]

        log.info(f"Descargando link: {url}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            msg = _map_ytdlp_error(result.stderr)
            raise WorkerError(msg)

        # Encontrar el archivo descargado
        files = list(Path(tmp_dir).glob("video.*"))
        # Excluir cookies.txt si existe
        video_files = [f for f in files if f.suffix != ".txt"]
        if not video_files:
            raise WorkerError("Error al descargar el video. Inténtalo de nuevo.")
        return video_files[0]

    elif job["source_type"] == "upload":
        storage_path = job["source_url"]
        log.info(f"Descargando desde Storage: {storage_path}")
        try:
            data = supabase.storage.from_("media").download(storage_path)
        except Exception as e:
            raise WorkerError(f"Error al acceder al archivo subido: {e}")

        # Detectar extensión del path
        ext = Path(storage_path).suffix or ".bin"
        local_path = Path(tmp_dir) / f"upload{ext}"
        local_path.write_bytes(data)
        return local_path

    else:
        raise WorkerError("Tipo de trabajo no reconocido.")


def convert_to_wav(input_path: Path, output_path: Path):
    log.info(f"Convirtiendo {input_path.name} a WAV mono 16kHz")
    cmd = [
        "ffmpeg", "-i", str(input_path),
        "-ac", "1",
        "-ar", "16000",
        "-acodec", "pcm_s16le",
        str(output_path),
        "-y"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        raise WorkerError("Error al convertir el archivo de audio. Formato no compatible.")


def upload_wav(job: dict, wav_path: Path) -> str:
    storage_path = f"{job['user_id']}/{job['id']}/audio.wav"
    log.info(f"Subiendo WAV a Storage: {storage_path}")
    with open(wav_path, "rb") as f:
        supabase.storage.from_("media").upload(
            storage_path,
            f.read(),
            {"content-type": "audio/wav", "upsert": "true"}
        )
    return storage_path


def process_job(job: dict):
    job_id = job["id"]
    log.info(f"Procesando job {job_id} ({job['source_type']})")

    with tempfile.TemporaryDirectory() as tmp_dir:
        try:
            update_job_status(job_id, "downloading")
            video_path = download_video(job, tmp_dir)

            update_job_status(job_id, "converting")
            wav_path = Path(tmp_dir) / "audio.wav"
            convert_to_wav(video_path, wav_path)

            upload_wav(job, wav_path)

            # 4. Transcribir
            update_job_status(job_id, "transcribing")
            from transcriber import transcribe_audio
            transcript_data = transcribe_audio(wav_path, job.get("language"))

            # 5. Subir archivos de resultado a Storage bucket 'results'
            user_id = job["user_id"]
            for ext, content in [
                ("txt", transcript_data["text_plain"]),
                ("srt", transcript_data["text_srt"]),
                ("md",  transcript_data["text_md"]),
            ]:
                path = f"{user_id}/{job_id}/transcript.{ext}"
                supabase.storage.from_("results").upload(
                    path,
                    content.encode("utf-8"),
                    file_options={"content-type": "text/plain; charset=utf-8", "upsert": "true"},
                )

            # 6. Insertar en tabla transcripts
            supabase.table("transcripts").insert({
                "job_id": job_id,
                "user_id": user_id,
                "text_plain": transcript_data["text_plain"],
                "text_srt": transcript_data["text_srt"],
                "text_md": transcript_data["text_md"],
                "detected_language": transcript_data["detected_language"],
                "duration_seconds": transcript_data["duration_seconds"],
            }).execute()

            # 7. Marcar job como done
            update_job_status(job_id, "done")
            log.info(f"Job {job_id} completado — {transcript_data['duration_seconds']}s, idioma: {transcript_data['detected_language']}")

        except WorkerError as e:
            log.error(f"Job {job_id} falló: {e}")
            update_job_status(job_id, "error", str(e))
        except subprocess.TimeoutExpired:
            log.error(f"Job {job_id} timeout")
            update_job_status(job_id, "error", "El procesamiento tardó demasiado. Inténtalo con un archivo más corto.")
        except Exception as e:
            log.exception(f"Job {job_id} error inesperado")
            update_job_status(job_id, "error", "Error inesperado. Inténtalo de nuevo.")


def main():
    log.info("Worker iniciado. Esperando trabajos...")
    while True:
        try:
            job = claim_next_job()
            if job:
                process_job(job)
            else:
                time.sleep(POLL_INTERVAL)
        except Exception as e:
            log.exception("Error en el loop principal")
            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
