plugins {
    java
    application
    id("com.github.ben-manes.versions") version "0.53.0"
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.duckdb:duckdb_jdbc:1.5.2.0")
    implementation("org.apache.arrow:arrow-vector:19.0.0")
    implementation("org.apache.arrow:arrow-c-data:19.0.0")
    runtimeOnly("org.apache.arrow:arrow-memory-netty:19.0.0")
    runtimeOnly("org.slf4j:slf4j-simple:2.0.7")
    runtimeOnly("io.netty:netty-buffer:4.2.7.Final")
    runtimeOnly("com.google.flatbuffers:flatbuffers-java:25.2.10")
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(25)
    }
}

application {
    mainClass = "benchmark.DuckDBBenchmark"
    applicationDefaultJvmArgs = listOf(
        "--add-opens=java.base/java.nio=ALL-UNNAMED",
        "--sun-misc-unsafe-memory-access=allow"
    )
}
