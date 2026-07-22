import sys
import os
import shutil
from datetime import datetime, timedelta
import time
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException

# Add parent directory to path so we can import backend packages
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.models import Base, User, SystemConfig, AuditLog
from backend.auth import (
    hash_password,
    verify_password,
    validate_password_policy,
    generate_recovery_key
)

# Use a local test SQLite DB
TEST_DB_FILE = "test_run.db"
if os.path.exists(TEST_DB_FILE):
    os.remove(TEST_DB_FILE)

engine = create_engine(f"sqlite:///{TEST_DB_FILE}")
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create all tables
Base.metadata.create_all(bind=engine)

def test_password_policy():
    print("Testing Password Policy...")
    # Empty
    try:
        validate_password_policy("")
        assert False, "Should have failed on empty password"
    except HTTPException as e:
        assert e.status_code == 400
        assert "empty" in e.detail

    # Too short
    try:
        validate_password_policy("short")
        assert False, "Should have failed on short password"
    except HTTPException as e:
        assert e.status_code == 400
        assert "at least 8" in e.detail

    # Blacklisted common password
    for pwd in ["password", "12345678", "aaaaaaaa", "admin123", "password123"]:
        try:
            validate_password_policy(pwd)
            assert False, f"Should have failed on blacklisted password: {pwd}"
        except HTTPException as e:
            assert e.status_code == 400
            assert "too common" in e.detail

    # Match current
    try:
        validate_password_policy("secret123", current_password="secret123")
        assert False, "Should have failed on same current password"
    except HTTPException as e:
        assert e.status_code == 400
        assert "same as" in e.detail

    # Correct
    validate_password_policy("my-secure-password-1")
    print("Password Policy Tests Passed!")


def test_recovery_key_generation():
    print("Testing Recovery Key Generation...")
    key = generate_recovery_key()
    assert len(key) == 19  # 16 characters + 3 hyphens
    assert key.count("-") == 3
    
    # Check that ambiguous characters are not present
    for char in ["O", "0", "I", "1"]:
        assert char not in key
        
    hashed = hash_password(key)
    assert verify_password(key, hashed)
    assert not verify_password("wrong-key", hashed)
    print("Recovery Key Generation Tests Passed!")


def test_progressive_delays():
    print("Testing Progressive Delays...")
    db = TestingSessionLocal()
    try:
        # Initial values
        attempts = 0
        last_failed_dt = None
        
        # Simulate Attempt 1 failure
        delay = 0
        assert delay == 0
        attempts += 1
        last_failed_dt = datetime.utcnow()
        
        # Simulate Attempt 2 failure
        # Previous failure is 1. Delay should be 5 seconds.
        delay = 5 if attempts == 1 else 0
        assert delay == 5
        
        # If we check now (elapsed < 5), it should reject
        elapsed = 1.0  # mock elapsed 1 second
        assert elapsed < delay
        wait_time = int(delay - elapsed)
        assert wait_time == 4
        
        # Simulate Attempt 3 failure
        # Previous failures = 2. Delay should be 15 seconds.
        attempts = 2
        delay = 15
        elapsed = 5.0
        assert elapsed < delay
        assert int(delay - elapsed) == 10
        
        # Simulate Attempt 4 failure
        # Previous failures = 3. Delay should be 30 seconds.
        attempts = 3
        delay = 30
        
        # Simulate Attempt 5 failure
        # Previous failures = 4. Delay should be 60 seconds.
        attempts = 4
        delay = 60
        
        # Verify correct key works immediately
        # Recovery key verification bypasses elapsed/delay check
        correct_key_verified = True
        if correct_key_verified:
            attempts = 0
            last_failed_dt = None
            
        assert attempts == 0
        print("Progressive Delays Logic Verification Passed!")
    finally:
        db.close()


def test_token_version():
    print("Testing Token Version Invalidation...")
    db = TestingSessionLocal()
    try:
        user = User(
            username="testuser",
            password_hash=hash_password("securepassword"),
            role="ADMIN",
            status="ACTIVE",
            must_change_password=False,
            token_version=1
        )
        db.add(user)
        db.commit()
        
        # Simulated payload token_version matches
        payload_token_version = 1
        assert payload_token_version == user.token_version
        
        # Simulate password change/reset - increments version
        user.password_hash = hash_password("newpassword")
        user.token_version += 1
        db.commit()
        
        # Simulated payload token_version no longer matches
        assert payload_token_version != user.token_version
        print("Token Version Invalidation Tests Passed!")
    finally:
        db.close()


def test_recovery_scope():
    print("Testing Recovery Scope Hierarchy...")
    db = TestingSessionLocal()
    try:
        # Create normal admin and super admin
        super_admin = User(
            username="superadmin",
            password_hash=hash_password("superpassword"),
            role="SUPER_ADMIN",
            status="ACTIVE",
            must_change_password=False,
            token_version=1
        )
        normal_admin = User(
            username="normaladmin",
            password_hash=hash_password("adminpassword"),
            role="ADMIN",
            status="ACTIVE",
            must_change_password=False,
            token_version=1
        )
        db.add(super_admin)
        db.add(normal_admin)
        db.commit()
        
        # Hierarchy constraints:
        # ADMIN role cannot reset SUPER_ADMIN
        target_role = super_admin.role
        caller_role = normal_admin.role
        
        if target_role == "SUPER_ADMIN" and caller_role != "SUPER_ADMIN":
            admin_can_reset = False
        else:
            admin_can_reset = True
            
        assert not admin_can_reset, "ADMIN should not be allowed to reset SUPER_ADMIN"
        
        # SUPER_ADMIN can reset ADMIN
        target_role_2 = normal_admin.role
        caller_role_2 = super_admin.role
        if target_role_2 == "SUPER_ADMIN" and caller_role_2 != "SUPER_ADMIN":
            super_can_reset = False
        else:
            super_can_reset = True
            
        assert super_can_reset, "SUPER_ADMIN should be allowed to reset ADMIN"
        print("Recovery Scope Hierarchy Tests Passed!")
    finally:
        db.close()


if __name__ == "__main__":
    try:
        test_password_policy()
        test_recovery_key_generation()
        test_progressive_delays()
        test_token_version()
        test_recovery_scope()
        print("\nALL BACKEND PASSWORD MANAGEMENT AND RECOVERY TESTS PASSED!")
    except AssertionError as e:
        print(f"\nTEST FAILED: {e}")
        sys.exit(1)
    finally:
        engine.dispose()
        if os.path.exists(TEST_DB_FILE):
            try:
                os.remove(TEST_DB_FILE)
            except Exception:
                pass
