"""
Authorization middleware - DEPRECATED

This middleware is kept for backwards compatibility but no longer performs
any authorization checks. All authentication and authorization should be
handled via FastAPI dependencies (get_current_user) in the route handlers.

The authz engine checks are now performed at the dependency level, not
middleware level.
"""

from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


class AuthorizationMiddleware(BaseHTTPMiddleware):
    """
    Middleware placeholder - all auth is now handled by dependencies.

    This middleware is deprecated and will be removed in a future version.
    All authentication should use:
        Depends(get_current_user)
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # AUTH IS NOW HANDLED BY DEPENDENCIES, NOT MIDDLEWARE
        # All routes should use: Depends(get_current_user)
        return await call_next(request)
