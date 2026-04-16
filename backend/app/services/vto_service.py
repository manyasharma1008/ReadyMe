"""
Virtual try-on service boundary.

This module intentionally keeps the provider integration behind one function so
the app can switch from a local placeholder to Google VTO or another provider
without changing frontend contracts.
"""

import os
from typing import Any


class VTOProviderNotConfigured(RuntimeError):
    """Raised when no real VTO provider has been configured."""


def _normalize_image_data(image_data: str | None) -> str | None:
    if not image_data:
        return None
    return image_data.split(",", 1)[1] if "," in image_data else image_data


async def generate_virtual_try_on(
    person_image: str,
    garment_image: str,
    measurements: dict[str, float],
    product: dict[str, Any] | None = None,
    size_recommendation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Generate an image-based virtual try-on preview.

    Set VTO_PROVIDER=google once the Google VTO credentials/client details are
    available, then replace the provider branch with the official API call.
    """

    provider = os.getenv("VTO_PROVIDER", "placeholder").strip().lower()

    if provider == "google":
        # Keep this branch explicit so missing credentials fail safely instead of
        # silently returning fake AI output.
        raise VTOProviderNotConfigured(
            "Google VTO provider is selected, but the provider client is not wired yet."
        )

    normalized_person_image = _normalize_image_data(person_image)

    return {
        "preview_image": normalized_person_image,
        "provider": "placeholder",
        "message": (
            "VTO provider is not configured yet. Returning the captured person "
            "image so the preview room flow can be tested end-to-end."
        ),
        "warnings": [
            "Set VTO_PROVIDER and wire the provider client in backend/app/services/vto_service.py."
        ],
        "debug": {
            "has_person_image": bool(person_image),
            "has_garment_image": bool(garment_image),
            "measurement_keys": sorted(measurements.keys()),
            "product_title": (product or {}).get("title"),
            "size": (size_recommendation or {}).get("size"),
        },
    }
