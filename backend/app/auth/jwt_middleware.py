"""
JWT Authentication Middleware for Supabase.
Validates Supabase JWT tokens and extracts user information.
"""

import os
from typing import Optional
from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from dotenv import load_dotenv

load_dotenv()

# Supabase JWT secret - use SUPABASE_JWT_SECRET if set, otherwise use SUPABASE_KEY as fallback
JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET") or os.getenv("SUPABASE_KEY", "")
ALGORITHM = "HS256"

security = HTTPBearer()


class TokenData:
    """Data extracted from JWT token."""
    def __init__(self, user_id: str, email: Optional[str] = None):
        self.user_id = user_id
        self.email = email


def decode_supabase_token(token: str) -> TokenData:
    """
    Decode and validate a Supabase JWT token.

    Args:
        token: JWT token string

    Returns:
        TokenData with user_id and optional email

    Raises:
        HTTPException: If token is invalid or expired
    """
    if not JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JWT secret not configured"
        )

    try:
        # Decode the token
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])

        # Extract user_id from the token
        # Supabase tokens have 'sub' claim for user ID
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing user ID"
            )

        # Extract email if available
        email = payload.get("email")

        return TokenData(user_id=user_id, email=email)

    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}"
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> TokenData:
    """
    FastAPI dependency to get the current authenticated user.

    Usage:
        @router.get("/protected")
        async def protected_route(user: TokenData = Depends(get_current_user)):
            return {"user_id": user.user_id}

    Args:
        credentials: HTTP Authorization header credentials

    Returns:
        TokenData with authenticated user's information

    Raises:
        HTTPException: If token is invalid or missing
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required"
        )

    token = credentials.credentials
    return decode_supabase_token(token)


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[TokenData]:
    """
    Optional authentication dependency - returns None if no valid token provided.

    Usage:
        @router.get("/optional-auth")
        async def optional_auth_route(user: Optional[TokenData] = Depends(get_current_user_optional)):
            if user:
                return {"user_id": user.user_id}
            return {"message": "anonymous"}

    Args:
        credentials: HTTP Authorization header credentials (optional)

    Returns:
        TokenData if valid token provided, None otherwise
    """
    if not credentials:
        return None

    try:
        return decode_supabase_token(credentials.credentials)
    except HTTPException:
        return None