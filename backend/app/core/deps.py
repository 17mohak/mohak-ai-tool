"""
Dependency injection utilities for authentication and authorization.

This module provides clean, reusable dependencies for FastAPI endpoints
to handle authentication with support for development mode bypass.
"""

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import decode_access_token
from app.core.config import settings
from app.models.user import User

security = HTTPBearer(auto_error=False)


class DevUser:
    """
    Mock user for development/debug mode.

    This provides a consistent user object when running in debug mode
    without requiring actual authentication. Always has admin role.
    """

    def __init__(self):
        self.id = "dev-user"
        self.email = "dev@atlas.local"
        self.name = "Development User"
        self._role_value = "ADMIN"
        self.is_active = True

    @property
    def role(self):
        """Mock role property that returns an object with a value attribute."""
        return type("Role", (), {"value": self._role_value})()

    def has_role(self, role: str) -> bool:
        """Check if user has a specific role."""
        return self._role_value == role

    def dict(self) -> dict:
        """Return user as dictionary for serialization."""
        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "role": self._role_value,
            "is_active": self.is_active,
        }


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User | DevUser:
    """
    Get the current authenticated user from the JWT token.

    Args:
        credentials: HTTP Bearer token credentials
        db: Database session

    Returns:
        User: The authenticated user object

    Raises:
        HTTPException: 401 if not authenticated or token is invalid
        HTTPException: 403 if user is inactive
    """
    # DEBUG MODE: Return dev user without checking token
    if settings.debug:
        return DevUser()

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    sub = payload.get("sub")
    if sub is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    result = await db.execute(select(User).where(User.id == int(sub)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive",
        )

    return user


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User | DevUser | None:
    """
    Get the current user if authenticated, otherwise return None.

    In DEBUG mode, always returns the DevUser.

    Args:
        credentials: HTTP Bearer token credentials
        db: Database session

    Returns:
        User | DevUser | None: The user if authenticated, DevUser in debug mode, or None
    """
    # DEBUG MODE: Always return dev user
    if settings.debug:
        return DevUser()

    if credentials is None:
        return None

    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None


async def get_current_active_user(
    current_user: User | DevUser = Depends(get_current_user),
) -> User | DevUser:
    """
    Ensure the current user is active.

    Args:
        current_user: The current user from get_current_user

    Returns:
        User: The active user

    Raises:
        HTTPException: 403 if user is inactive
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive",
        )
    return current_user


def require_roles(*allowed_roles: str):
    """
    Dependency factory to require specific roles.

    Usage:
        @router.get("/admin-only")
        async def admin_endpoint(user: User = Depends(require_roles("ADMIN"))):
            return {"message": "Hello Admin"}

    Args:
        *allowed_roles: Variable list of allowed role names

    Returns:
        Callable: Dependency function that checks user role
    """

    async def role_checker(
        current_user: User | DevUser = Depends(get_current_user),
    ) -> User | DevUser:
        # DEBUG MODE: Always allow
        if settings.debug:
            return current_user

        user_role = (
            current_user.role.value
            if hasattr(current_user.role, "value")
            else str(current_user.role)
        )
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required roles: {', '.join(allowed_roles)}",
            )
        return current_user

    return role_checker


def get_current_user_from_request(request: Request) -> User | DevUser | None:
    """
    Extract current user from request state (set by middleware).

    This is useful when you need to access the user object outside of
    FastAPI's dependency injection system.

    Args:
        request: The FastAPI request object

    Returns:
        User | DevUser | None: The user if available in request state
    """
    return getattr(request.state, "user", None)
