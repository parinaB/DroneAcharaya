"""The one frame shape every bridge source produces and every consumer
(DB writer, broadcast, API) reads — column set matches
data/README.md's telemetry/<run_id>.csv table exactly, so a real batch or
a real ECU source can implement FrameSource later with zero downstream
change (see sources.py)."""

from __future__ import annotations

from pydantic import BaseModel


class EngineFrame(BaseModel):
    t: float
    data_origin: str

    rpm: float
    torque: float
    power: float
    engine_load: float

    cht_c1: float
    cht_c2: float
    cht_c3: float
    cht_c4: float
    egt_c1: float
    egt_c2: float
    egt_c3: float
    egt_c4: float

    oil_pressure: float
    oil_temperature: float
    fuel_flow: float
    rail_pressure: float
    injection_timing: float
    boost_pressure: float
    map: float
    intake_temperature: float
    air_mass_flow: float
    coolant_temperature: float

    vibration_rms_x: float | None = None
    vibration_order_1x: float | None = None
    vibration_rms_x_bearing_proxy: float
    vibration_order_1x_bearing_proxy: float

    battery_voltage: float
    battery_current: float
    alternator_power: float

    altitude: float
    ambient_pressure: float
    ambient_temperature: float
    air_density: float

    throttle: float
    engine_state: str
