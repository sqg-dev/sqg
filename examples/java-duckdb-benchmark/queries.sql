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

-- QUERY count_readings :one :pluck
SELECT COUNT(*) FROM sensor_readings;

-- QUERY first_reading :one
SELECT device_id, timestamp, temperature, location
FROM sensor_readings ORDER BY timestamp LIMIT 1;

-- QUERY last_readings
SELECT device_id, timestamp, temperature, location
FROM sensor_readings ORDER BY timestamp DESC LIMIT 10;

-- EXEC insert_reading :batch
@set device_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
@set timestamp = '2025-01-01T00:00:00Z'
@set temperature = 20.5
@set humidity = 55.0
@set pressure = 1013.25
@set battery_level = 85
@set is_anomaly = false
@set location = 'warehouse-A'
@set tags = ['temperature','indoor']
INSERT INTO sensor_readings (device_id, timestamp, temperature, humidity, pressure, battery_level, is_anomaly, location, tags)
VALUES (${device_id}, ${timestamp}, ${temperature}, ${humidity}, ${pressure}, ${battery_level}, ${is_anomaly}, ${location}, ${tags});

-- EXEC update_reading :batch
@set temperature = 42.0
@set device_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
@set timestamp = '2025-01-01T00:00:00Z'
UPDATE sensor_readings SET temperature = ${temperature}
WHERE device_id = ${device_id} AND timestamp = ${timestamp};

-- EXEC update_readings_unnest
@set device_ids = '[a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11]'
@set timestamps = '[2025-01-01T00:00:00Z]'
@set temperatures = '[42.0]'
UPDATE sensor_readings s
SET temperature = k.temperature
FROM (
    SELECT UNNEST(${device_ids}::UUID[]) AS device_id,
           UNNEST(${timestamps}::TIMESTAMPTZ[]) AS timestamp,
           UNNEST(${temperatures}::DOUBLE[]) AS temperature
) k
WHERE s.device_id = k.device_id AND s.timestamp = k.timestamp;

-- EXEC delete_reading :batch
@set device_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
@set timestamp = '2025-01-01T00:00:00Z'
DELETE FROM sensor_readings WHERE device_id = ${device_id} AND timestamp = ${timestamp};

-- EXEC delete_readings_unnest
@set device_ids = '[a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11]'
@set timestamps = '[2025-01-01T00:00:00Z]'
DELETE FROM sensor_readings
WHERE (device_id, timestamp) IN (
    SELECT UNNEST(${device_ids}::UUID[]) AS device_id,
           UNNEST(${timestamps}::TIMESTAMPTZ[]) AS timestamp
);

-- TESTDATA _create_delete_keys
CREATE TEMP TABLE IF NOT EXISTS _delete_keys (
    device_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL
);

-- TABLE _delete_keys :appender

-- EXEC create_delete_keys
CREATE OR REPLACE TEMP TABLE _delete_keys (
    device_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL
);

-- EXEC delete_via_staging
DELETE FROM sensor_readings s
USING _delete_keys k
WHERE s.device_id = k.device_id AND s.timestamp = k.timestamp;

-- TESTDATA _create_update_keys
CREATE TEMP TABLE IF NOT EXISTS _update_keys (
    device_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    temperature DOUBLE
);

-- TABLE _update_keys :appender

-- EXEC create_update_keys
CREATE OR REPLACE TEMP TABLE _update_keys (
    device_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    temperature DOUBLE
);

-- EXEC update_via_staging
UPDATE sensor_readings s
SET temperature = k.temperature
FROM _update_keys k
WHERE s.device_id = k.device_id AND s.timestamp = k.timestamp;
