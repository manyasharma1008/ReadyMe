import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Lazy initialization to prevent startup failures
_supabase_client: Client | None = None


def get_supabase_client() -> Client | None:
    """Get or create the Supabase client. Returns None if not configured."""
    global _supabase_client

    if _supabase_client is not None:
        return _supabase_client

    if not SUPABASE_URL or not SUPABASE_KEY:
        return None

    try:
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        return _supabase_client
    except Exception:
        return None


# For backward compatibility - returns None if not configured
supabase: Client | None = get_supabase_client()