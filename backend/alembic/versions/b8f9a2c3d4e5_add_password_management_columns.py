"""add password management columns

Revision ID: b8f9a2c3d4e5
Revises: a7e6b7c8d9e0
Create Date: 2026-07-18 16:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8f9a2c3d4e5'
down_revision: Union[str, Sequence[str], None] = 'a7e6b7c8d9e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new columns to 'users' table
    op.add_column('users', sa.Column('must_change_password', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('users', sa.Column('token_version', sa.Integer(), server_default='1', nullable=False))


def downgrade() -> None:
    # Remove columns from 'users' table
    op.drop_column('users', 'token_version')
    op.drop_column('users', 'must_change_password')
