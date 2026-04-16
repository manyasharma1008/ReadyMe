"""
Profile Router for Body Profile CRUD operations.
Handles saving, retrieving, and updating user body measurements.
"""

from fastapi import APIRouter, HTTPException, Depends, status
from datetime import datetime

from app.db.supabase import supabase
from app.models.schemas import ProfileSaveRequest, ProfileResponse, BodyMeasurements
from app.auth.jwt_middleware import get_current_user, TokenData

router = APIRouter()


@router.post("/save", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED)
async def save_profile(request: ProfileSaveRequest):
    """
    Save body profile measurements for a user.

    Creates a new body profile in the database with the provided measurements.
    If a profile already exists for the user, it will create a new one.

    Args:
        request: ProfileSaveRequest with user_id and measurements

    Returns:
        ProfileResponse with created profile data

    Raises:
        HTTPException: If database operation fails
    """
    try:
        # Prepare the data for insertion
        profile_data = {
            "user_id": request.user_id,
            "height": request.measurements.height,
            "chest": request.measurements.chest,
            "waist": request.measurements.waist,
            "hips": request.measurements.hips,
            "shoulder_width": request.measurements.shoulder_width,
            "name": request.name,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }

        # Insert into database
        response = supabase.table("body_profiles").insert(profile_data).execute()

        if response.error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to save profile: {response.error.message}"
            )

        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to save profile: no data returned"
            )

        # Parse the response into ProfileResponse
        profile = response.data[0]
        return ProfileResponse(
            id=str(profile["id"]),
            user_id=profile["user_id"],
            measurements=BodyMeasurements(
                height=profile["height"],
                chest=profile["chest"],
                waist=profile["waist"],
                hips=profile["hips"],
                shoulder_width=profile["shoulder_width"]
            ),
            name=profile.get("name"),
            created_at=profile["created_at"],
            updated_at=profile["updated_at"]
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error saving profile: {str(e)}"
        )


@router.get("/get", response_model=ProfileResponse)
async def get_profile(current_user: TokenData = Depends(get_current_user)):
    """
    Get the authenticated user's body profile.

    Requires JWT authentication. Returns the most recent body profile
    for the authenticated user.

    Args:
        current_user: TokenData from JWT authentication

    Returns:
        ProfileResponse with profile data

    Raises:
        HTTPException: 404 if profile not found, 401 if not authenticated
    """
    try:
        # Fetch the most recent profile for the authenticated user
        response = supabase.table("body_profiles") \
            .select("*") \
            .eq("user_id", current_user.user_id) \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()

        if response.error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to fetch profile: {response.error.message}"
            )

        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found. Please save a profile first."
            )

        # Parse the response into ProfileResponse
        profile = response.data[0]
        return ProfileResponse(
            id=str(profile["id"]),
            user_id=profile["user_id"],
            measurements=BodyMeasurements(
                height=profile["height"],
                chest=profile["chest"],
                waist=profile["waist"],
                hips=profile["hips"],
                shoulder_width=profile["shoulder_width"]
            ),
            name=profile.get("name"),
            created_at=profile["created_at"],
            updated_at=profile["updated_at"]
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching profile: {str(e)}"
        )


@router.put("/update", response_model=ProfileResponse)
async def update_profile(
    measurements: BodyMeasurements,
    name: str = None,
    current_user: TokenData = Depends(get_current_user)
):
    """
    Update the authenticated user's body profile.

    Requires JWT authentication. Updates the most recent body profile
    for the authenticated user with new measurements.

    Args:
        measurements: New body measurements
        name: Optional new profile name
        current_user: TokenData from JWT authentication

    Returns:
        ProfileResponse with updated profile data

    Raises:
        HTTPException: 404 if profile not found, 401 if not authenticated
    """
    try:
        # First, get the most recent profile
        existing = supabase.table("body_profiles") \
            .select("*") \
            .eq("user_id", current_user.user_id) \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()

        if existing.error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to fetch profile: {existing.error.message}"
            )

        if not existing.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found. Please save a profile first."
            )

        # Update the profile
        profile_id = existing.data[0]["id"]
        update_data = {
            "height": measurements.height,
            "chest": measurements.chest,
            "waist": measurements.waist,
            "hips": measurements.hips,
            "shoulder_width": measurements.shoulder_width,
            "updated_at": datetime.utcnow().isoformat()
        }

        if name is not None:
            update_data["name"] = name

        response = supabase.table("body_profiles") \
            .update(update_data) \
            .eq("id", profile_id) \
            .execute()

        if response.error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to update profile: {response.error.message}"
            )

        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update profile: no data returned"
            )

        # Parse the response into ProfileResponse
        profile = response.data[0]
        return ProfileResponse(
            id=str(profile["id"]),
            user_id=profile["user_id"],
            measurements=BodyMeasurements(
                height=profile["height"],
                chest=profile["chest"],
                waist=profile["waist"],
                hips=profile["hips"],
                shoulder_width=profile["shoulder_width"]
            ),
            name=profile.get("name"),
            created_at=profile["created_at"],
            updated_at=profile["updated_at"]
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating profile: {str(e)}"
        )