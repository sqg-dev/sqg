package benchmark;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.UUID;

public class SensorDataGenerator {

    static final String[] LOCATIONS = {
        "warehouse-A", "warehouse-B", "outdoor-north", "outdoor-south",
        "lab-clean-room", "lab-general", "roof-sensor", "basement-hvac",
        "server-room-1", "server-room-2"
    };

    static final String[][] TAG_OPTIONS = {
        {"temperature", "indoor"},
        {"temperature", "outdoor"},
        {"humidity", "critical"},
        {"pressure", "calibrated"},
        {"battery", "low-power"},
        {"anomaly", "flagged"},
        {},
    };

    static final UUID[] DEVICE_IDS;
    static {
        var rng = new Random(12345);
        DEVICE_IDS = new UUID[100];
        for (int i = 0; i < 100; i++) {
            DEVICE_IDS[i] = new UUID(rng.nextLong(), rng.nextLong());
        }
    }

    public record RowData(
        UUID deviceId,
        OffsetDateTime timestamp,
        Double temperature,
        Double humidity,
        BigDecimal pressure,
        Short batteryLevel,
        Boolean isAnomaly,
        String location,
        List<String> tags
    ) {}

    public static List<RowData> generate(int count) {
        var rng = new Random(42);
        var rows = new ArrayList<RowData>(count);
        var baseTime = OffsetDateTime.of(2025, 1, 1, 0, 0, 0, 0, ZoneOffset.UTC);

        for (int i = 0; i < count; i++) {
            rows.add(new RowData(
                DEVICE_IDS[rng.nextInt(DEVICE_IDS.length)],
                baseTime.plusSeconds(i * 10L),
                18.0 + rng.nextDouble() * 15.0,
                30.0 + rng.nextDouble() * 50.0,
                BigDecimal.valueOf(980 + rng.nextDouble() * 40).setScale(2, RoundingMode.HALF_UP),
                (short) (20 + rng.nextInt(80)),
                rng.nextDouble() < 0.05,
                LOCATIONS[rng.nextInt(LOCATIONS.length)],
                List.of(TAG_OPTIONS[rng.nextInt(TAG_OPTIONS.length)])
            ));
        }
        return rows;
    }
}
