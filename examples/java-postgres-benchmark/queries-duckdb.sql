-- MIGRATE 1
CREATE TABLE sensor_readings (
    device_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    temperature DOUBLE,
    humidity DOUBLE,
    pressure DECIMAL(10, 2),
    battery_level SMALLINT,
    is_anomaly BOOLEAN,
    location VARCHAR,
    tags VARCHAR[]
);

-- TABLE sensor_readings :appender
