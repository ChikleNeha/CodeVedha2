import asyncio
import sys
import io
import traceback
from typing import Tuple


async def run_python_code(code: str, timeout: int = 10) -> Tuple[str, str, bool]:
    """
    Safely runs Python code in a subprocess and captures stdout/stderr.

    Returns:
        (stdout, stderr, success)
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            sys.executable, "-c", code,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(), timeout=timeout
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            return "", "TimeoutError: Code took too long to run (10 second limit).", False

        stdout = stdout_bytes.decode("utf-8", errors="replace").strip()
        stderr = stderr_bytes.decode("utf-8", errors="replace").strip()
        success = proc.returncode == 0
        return stdout, stderr, success

    except Exception as e:
        return "", f"Runner error: {str(e)}", False


def format_output_for_speech(stdout: str, stderr: str, success: bool) -> str:
    """
    Converts code execution result into plain Hinglish speech-friendly text.
    No markdown, no symbols — screen reader safe.
    """
    if success and stdout:
        return f"Code chal gaya. Output hai: {stdout}"
    elif success and not stdout:
        return "Code chal gaya. Koi output nahi aaya."
    else:
        # Extract just the last error line for brevity in speech
        error_lines = [l for l in stderr.splitlines() if l.strip()]
        short_error = error_lines[-1] if error_lines else stderr
        return f"Code mein error aaya. Error hai: {short_error}"