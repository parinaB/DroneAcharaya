"""add sensor_fault fields to health_scores

Revision ID: ea13eb8b9d97
Revises: 90bdc44f934d
Create Date: 2026-09-03 02:09:20.730811

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "ea13eb8b9d97"
down_revision: Union[str, Sequence[str], None] = "90bdc44f934d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("health_scores", sa.Column("sensor_fault_cht_c3", sa.String(), nullable=True))
    op.add_column("health_scores", sa.Column("sensor_fault_bearing_vibration", sa.String(), nullable=True))
    op.add_column("health_scores", sa.Column("sensor_fault_model_version", sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("health_scores", "sensor_fault_model_version")
    op.drop_column("health_scores", "sensor_fault_bearing_vibration")
    op.drop_column("health_scores", "sensor_fault_cht_c3")
