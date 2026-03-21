from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi import status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
)
from app.core.config import settings
from app.models.user import User, UserStatus, UserRole
from app.models.timetable import Teacher
from app.schemas.user_schema import LoginRequest, RegisterRequest, TokenResponse
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Login endpoint - minimal and stable version."""
    # Log attempt
    print(f"[LOGIN ATTEMPT] Email: {body.email}")

    try:
        # 1. Fetch user
        result = await db.execute(select(User).where(User.email == body.email))
        user = result.scalar_one_or_none()

        if not user:
            print(f"[LOGIN FAIL] User not found: {body.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
            )

        print(f"[LOGIN] User found: {user.email}, ID: {user.id}")

        # 2. Check password exists
        if not user.hashed_password:
            print(f"[LOGIN ERROR] User has no password: {body.email}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="User account error - no password set",
            )

        # 3. Verify password (wrapped in try/catch)
        try:
            print(
                f"[LOGIN] Verifying password... (hash starts with: {user.hashed_password[:10]}...)"
            )
            valid = verify_password(body.password, user.hashed_password)
            print(f"[LOGIN] Password verification result: {valid}")
        except Exception as e:
            print(
                f"[LOGIN ERROR] Password verification crashed: {type(e).__name__}: {str(e)}"
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Password verification error: {type(e).__name__}",
            )

        if not valid:
            print(f"[LOGIN FAIL] Invalid password for: {body.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
            )

        # 4. Check user status (minimal)
        if user.status == UserStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is pending approval.",
            )

        if user.status == UserStatus.REJECTED:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account has been rejected.",
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User is inactive",
            )

        # 5. Success - create token
        access_token = create_access_token(data={"sub": str(user.id)})
        print(f"[LOGIN SUCCESS] Token created for: {body.email}")
        return TokenResponse(access_token=access_token)

    except HTTPException:
        # Re-raise HTTP exceptions (401, 403, 500)
        raise
    except Exception as e:
        # Catch any unexpected errors
        print(f"[LOGIN CRASH] Unexpected error: {type(e).__name__}: {str(e)}")
        import traceback

        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {type(e).__name__}",
        )


@router.post("/register", response_model=TokenResponse)
async def register(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Check if email domain is in approved list
    parts = body.email.strip().split("@")
    if len(parts) != 2 or not parts[1]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid email format",
        )
    email_domain = parts[1].lower()
    approved_domains = [
        d.strip().lower()
        for d in settings.approved_email_domains.split(",")
        if d.strip()
    ]

    if email_domain in approved_domains:
        user_status = UserStatus.APPROVED
        is_active = True
    else:
        user_status = UserStatus.PENDING
        is_active = False

    # Validate teacher_id if provided
    teacher_id = None
    if body.teacher_id:
        teacher_result = await db.execute(
            select(Teacher).where(Teacher.id == body.teacher_id)
        )
        teacher = teacher_result.scalar_one_or_none()
        if not teacher:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Teacher not found",
            )
        teacher_id = body.teacher_id

    user = User(
        email=body.email,
        hashed_password=get_password_hash(body.password),
        role=body.role,
        status=user_status,
        is_active=is_active,
        teacher_id=teacher_id,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    if user_status == UserStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_202_ACCEPTED,
            detail="Registration successful. Your account is pending approval.",
        )

    access_token = create_access_token(data={"sub": str(user.id)})
    return TokenResponse(access_token=access_token)


@router.get("/debug-token")
async def debug_token(
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer()),
):
    """Debug endpoint to verify token is being received correctly."""
    return {
        "token_received": True,
        "token_preview": credentials.credentials[:30] + "..."
        if len(credentials.credentials) > 30
        else credentials.credentials,
        "token_length": len(credentials.credentials),
    }


@router.get("/me-debug")
async def me_debug(request: Request):
    """Debug endpoint to check if Authorization header is arriving."""
    print("[ME-DEBUG] Headers received:")
    for key, value in request.headers.items():
        if key.lower() in ["authorization", "content-type", "origin"]:
            print(f"  {key}: {value}")

    auth_header = request.headers.get("authorization")
    if not auth_header:
        return {"error": "No authorization header", "headers": dict(request.headers)}

    if not auth_header.startswith("Bearer "):
        return {
            "error": "Invalid format - must start with Bearer",
            "header": auth_header,
        }

    token = auth_header.split(" ")[1]
    return {"token_received": True, "token_preview": token[:20] + "..."}


@router.get("/me")
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information including role and teacher linkage."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role.value,
        "status": current_user.status.value,
        "is_active": current_user.is_active,
        "teacher_id": current_user.teacher_id,
        "created_at": current_user.created_at.isoformat()
        if current_user.created_at
        else None,
    }
