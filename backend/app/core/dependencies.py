from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import decode_access_token
from app.core.authz import authz_engine
from app.models.user import User

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    print(f"[AUTH] get_current_user called")

    if credentials is None:
        print("[AUTH] ERROR: No credentials provided (credentials is None)")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated - no credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    print(
        f"[AUTH] Token received: {token[:30]}..."
        if len(token) > 30
        else f"[AUTH] Token received: {token}"
    )

    payload = decode_access_token(token)
    if payload is None:
        print("[AUTH] ERROR: decode_access_token returned None")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    print(f"[AUTH] Token decoded successfully: {payload}")

    sub = payload.get("sub")
    if sub is None:
        print("[AUTH] ERROR: No 'sub' in payload")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload - no sub",
        )

    print(f"[AUTH] Looking up user_id: {sub}")

    result = await db.execute(select(User).where(User.id == int(sub)))
    user = result.scalar_one_or_none()
    if user is None:
        print(f"[AUTH] ERROR: User not found for id {sub}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    print(f"[AUTH] SUCCESS: User found - {user.email}")

    if not user.is_active:
        print(f"[AUTH] ERROR: User {user.email} is inactive")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive",
        )
    return user


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Get current user if authenticated, otherwise return None."""
    if credentials is None:
        return None
    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None


def require_role(*allowed_roles: str):
    """DEPRECATED: Use authz engine instead."""

    async def role_checker(
        current_user: User = Depends(get_current_user),
    ) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return role_checker


async def check_authorization(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> User:
    """Check if user has permission using authz engine."""
    authz_engine.require_permission(
        path=request.url.path,
        method=request.method,
        user_role=current_user.role.value,
    )
    return current_user
