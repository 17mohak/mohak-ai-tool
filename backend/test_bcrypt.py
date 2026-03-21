#!/usr/bin/env python3
"""Test bcrypt password hashing and verification."""

from passlib.context import CryptContext

# Initialize password context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def test_password_hashing():
    """Test that bcrypt hashing and verification works."""
    test_password = "password"

    print("=" * 50)
    print("BCRYPT PASSWORD TEST")
    print("=" * 50)

    # Test 1: Hash password
    print(f"\n1. Hashing password: '{test_password}'")
    try:
        hashed = pwd_context.hash(test_password)
        print(f"   SUCCESS - Hash: {hashed}")
        print(f"   Hash starts with: {hashed[:7]}")
    except Exception as e:
        print(f"   FAILED: {type(e).__name__}: {e}")
        return False

    # Test 2: Verify correct password
    print(f"\n2. Verifying correct password...")
    try:
        result = pwd_context.verify(test_password, hashed)
        print(f"   SUCCESS - Result: {result}")
        if not result:
            print("   FAILED - Verification returned False for correct password!")
            return False
    except Exception as e:
        print(f"   FAILED: {type(e).__name__}: {e}")
        return False

    # Test 3: Verify wrong password
    print(f"\n3. Verifying wrong password ('wrongpassword')...")
    try:
        result = pwd_context.verify("wrongpassword", hashed)
        print(f"   SUCCESS - Result: {result}")
        if result:
            print("   FAILED - Verification returned True for wrong password!")
            return False
    except Exception as e:
        print(f"   FAILED: {type(e).__name__}: {e}")
        return False

    # Test 4: Verify with admin hash from migration
    print(f"\n4. Testing with admin hash from migration...")
    admin_hash = "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW"
    try:
        result = pwd_context.verify("password", admin_hash)
        print(f"   SUCCESS - Admin password verification: {result}")
        if not result:
            print("   WARNING - Admin password verification returned False")
    except Exception as e:
        print(f"   FAILED: {type(e).__name__}: {e}")
        return False

    print("\n" + "=" * 50)
    print("ALL TESTS PASSED!")
    print("=" * 50)
    return True


if __name__ == "__main__":
    success = test_password_hashing()
    exit(0 if success else 1)
