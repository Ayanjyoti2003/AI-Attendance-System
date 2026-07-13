"""add camera diagnostics columns

Revision ID: a7e6b7c8d9e0
Revises: e964957f745f
Create Date: 2026-07-13 13:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7e6b7c8d9e0'
down_revision: Union[str, Sequence[str], None] = 'e964957f745f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new columns to 'cameras' table
    op.add_column('cameras', sa.Column('last_error', sa.String(), nullable=True))
    op.add_column('cameras', sa.Column('last_successful_frame', sa.DateTime(), nullable=True))
    op.add_column('cameras', sa.Column('device_name', sa.String(), nullable=True))


def downgrade() -> None:
    # Remove columns from 'cameras' table
    op.drop_column('cameras', 'device_name')
    op.drop_column('cameras', 'last_successful_frame')
    op.drop_column('cameras', 'last_error')
