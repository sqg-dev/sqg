-- MIGRATE 1
CREATE TABLE sensor_readings (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    device_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    pressure NUMERIC(10, 2),
    battery_level SMALLINT,
    is_anomaly BOOLEAN DEFAULT false,
    location TEXT,
    tags TEXT[]
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

-- EXEC insert_reading
@set device_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
@set timestamp = '2025-01-01T00:00:00Z'
@set temperature = 20.5
@set humidity = 55.0
@set pressure = 1013.25
@set battery_level = 85
@set is_anomaly = false
@set location = 'warehouse-A'
@set tags = '{temperature,indoor}'
INSERT INTO sensor_readings (device_id, timestamp, temperature, humidity, pressure, battery_level, is_anomaly, location, tags)
VALUES (${device_id}, ${timestamp}, ${temperature}, ${humidity}, ${pressure}, ${battery_level}, ${is_anomaly}, ${location}, ${tags});

-- EXEC insert_readings_unnest
@set device_ids = '{a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11}'
@set timestamps = '{2025-01-01T00:00:00Z}'
@set temperatures = '{20.5}'
@set humidities = '{55.0}'
@set pressures = '{1013.25}'
@set battery_levels = '{85}'
@set anomalies = '{false}'
@set locations = '{warehouse-A}'
@set tag_literals = '{"{temperature,indoor}"}'
INSERT INTO sensor_readings (device_id, timestamp, temperature, humidity, pressure, battery_level, is_anomaly, location, tags)
SELECT d, ts, temp, hum, pres, bat, anom, loc, t::text[]
FROM unnest(${device_ids}::uuid[], ${timestamps}::timestamptz[], ${temperatures}::float8[], ${humidities}::float8[], ${pressures}::numeric[], ${battery_levels}::smallint[], ${anomalies}::boolean[], ${locations}::text[], ${tag_literals}::text[])
    AS t(d, ts, temp, hum, pres, bat, anom, loc, t);
