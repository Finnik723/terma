package io.github.finnik723.terma.storage;

import java.io.IOException;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

/** Only active through -Ppostgresql-it; absence of PostgreSQL is a failure, never a skip. */
class PostgreSqlIT {
    private final Path root = Path.of(System.getProperty("terma.root"));
    private final ArrayList<Running> children = new ArrayList<>();
    private final ArrayList<Path> temporaryChangelogs = new ArrayList<>();
    private String baseUrl;
    private String username;
    private String password;
    private String schema;
    private String url;

    private static String required(String name) {
        String value = System.getenv(name);
        assertNotNull(value, "Required integration setting: " + name);
        assertFalse(value.isBlank(), "Required integration setting: " + name);
        return value;
    }

    @BeforeEach void createIsolatedSchema() throws Exception {
        baseUrl = required("SPRING_DATASOURCE_URL");
        username = required("SPRING_DATASOURCE_USERNAME");
        password = required("SPRING_DATASOURCE_PASSWORD");
        assertTrue(baseUrl.startsWith("jdbc:postgresql://"), "A real PostgreSQL endpoint is required");
        schema = "terma_it_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = DriverManager.getConnection(baseUrl, username, password); var sql = connection.createStatement()) {
            assertEquals("PostgreSQL", connection.getMetaData().getDatabaseProductName());
            sql.execute("CREATE SCHEMA " + schema);
        }
        url = baseUrl + (baseUrl.contains("?") ? "&" : "?") + "currentSchema=" + schema;
    }

    @AfterEach void cleanup() throws Exception {
        try {
            for (var child : children) child.close();
        } finally {
            for (var changelog : temporaryChangelogs) Files.deleteIfExists(changelog);
            if (schema != null && schema.matches("terma_it_[a-f0-9]{32}")) {
                try (var connection = DriverManager.getConnection(baseUrl, username, password); var sql = connection.createStatement()) {
                    sql.execute("DROP SCHEMA " + schema + " CASCADE");
                }
            }
        }
    }

    private Connection connection() throws Exception { return DriverManager.getConnection(url, username, password); }

    private String scalar(String query) throws Exception {
        try (var connection = connection(); var statement = connection.createStatement(); var result = statement.executeQuery(query)) {
            assertTrue(result.next());
            return result.getString(1);
        }
    }

    private void sql(String query) throws Exception {
        try (var connection = connection(); var statement = connection.createStatement()) { statement.execute(query); }
    }

    private Running launch(String module, Map<String, String> overrides) throws Exception {
        var environment = new HashMap<String, String>();
        environment.put("SPRING_DATASOURCE_URL", url);
        environment.put("SPRING_DATASOURCE_USERNAME", username);
        environment.put("SPRING_DATASOURCE_PASSWORD", password);
        environment.put("SERVER_ADDRESS", "127.0.0.1");
        environment.putAll(overrides);
        var child = new Running(module, environment);
        children.add(child);
        return child;
    }

    private void worker() throws Exception {
        try (var child = launch("worker", Map.of())) { child.ready(); }
    }

    private Map<String, String> pendingMigration() throws Exception {
        Path changelog = Files.createTempFile(root.resolve("storage-integration/target"), "pending-migration-", ".sql");
        Files.writeString(changelog, "--liquibase formatted sql\n--changeset integration:pending\nSELECT 2;\n");
        temporaryChangelogs.add(changelog);
        return Map.of("SPRING_LIQUIBASE_CHANGE_LOG", changelog.toUri().toString());
    }

    @Test void bothApplicationsMigrateOnceAndPreserveCommittedDataOnRestart() throws Exception {
        worker();
        assertEquals("1", scalar("SELECT count(*) FROM databasechangelog"));
        String checksum = scalar("SELECT md5sum FROM databasechangelog WHERE id='001-storage-baseline'");
        // A test-owned table, never shipped as a domain table or migration.
        sql("CREATE TABLE storage_probe (value text NOT NULL)");
        sql("INSERT INTO storage_probe VALUES ('committed-before-restart')");
        try (var backend = launch("backend", Map.of())) { backend.ready(); }
        worker();
        assertEquals("1", scalar("SELECT count(*) FROM databasechangelog"));
        assertEquals(checksum, scalar("SELECT md5sum FROM databasechangelog WHERE id='001-storage-baseline'"));
        assertEquals("committed-before-restart", scalar("SELECT value FROM storage_probe"));
        assertEquals("3", scalar("SELECT count(*) FROM information_schema.tables WHERE table_schema=current_schema()"));
    }

    @Test void simultaneousCleanStartupUsesOneHistory() throws Exception {
        try (var backend = launch("backend", Map.of()); var worker = launch("worker", Map.of())) {
            backend.ready();
            worker.ready();
            assertEquals("1", scalar("SELECT count(*) FROM databasechangelog"));
            assertEquals("false", scalar("SELECT locked::text FROM databasechangeloglock"));
        }
    }

    @Test void missingConfigurationAndUnavailableDatabaseFailBothProcesses() throws Exception {
        for (String module : new String[]{"backend", "worker"}) {
            for (String property : new String[]{"SPRING_DATASOURCE_URL", "SPRING_DATASOURCE_USERNAME", "SPRING_DATASOURCE_PASSWORD"}) {
                try (var child = launch(module, Map.of(property, ""))) { child.failed(60, "Missing required configuration"); }
            }
            int closedPort;
            try (var socket = new ServerSocket(0)) { closedPort = socket.getLocalPort(); }
            try (var child = launch(module, Map.of("SPRING_DATASOURCE_URL", "jdbc:postgresql://127.0.0.1:" + closedPort + "/unavailable"))) {
                child.failed(60, "Connection");
            }
            String wrongPassword = UUID.randomUUID().toString();
            try (var child = launch(module, Map.of("SPRING_DATASOURCE_PASSWORD", wrongPassword))) {
                child.failed(60, "authentication failed");
                assertFalse(child.logs().contains(wrongPassword), "Password must not appear in startup output");
            }
            try (var child = launch(module, Map.of("SPRING_DATASOURCE_URL", url + "&password=url-secret"))) {
                child.failed(60, "Credentials are forbidden");
                assertFalse(child.logs().contains("url-secret"), "URL secret must not appear in output");
            }
        }
    }

    @Test void migrationSqlFailureAndChecksumMismatchFailBothProcesses() throws Exception {
        Path broken = Files.createTempFile(root.resolve("storage-integration/target"), "broken-migration-", ".sql");
        Files.writeString(broken, "--liquibase formatted sql\n--changeset integration:broken\nTHIS IS NOT VALID SQL;\n");
        try {
            for (String module : new String[]{"backend", "worker"}) {
                try (var child = launch(module, Map.of("SPRING_LIQUIBASE_CHANGE_LOG", broken.toUri().toString()))) {
                    child.failed(60, "syntax error");
                }
            }
        } finally {
            Files.deleteIfExists(broken);
        }
        worker();
        sql("UPDATE databasechangelog SET md5sum='9:00000000000000000000000000000000'");
        for (String module : new String[]{"backend", "worker"}) {
            try (var child = launch(module, Map.of())) { child.failed(60, "check sum"); }
        }
        assertEquals("9:00000000000000000000000000000000", scalar("SELECT md5sum FROM databasechangelog"));
    }

    @Test void connectionLossDuringStartupIsNotReportedAsSuccess() throws Exception {
        worker();
        sql("UPDATE databasechangeloglock SET locked=true, lockedby='integration-test', lockgranted=CURRENT_TIMESTAMP");
        // Liquibase intentionally bypasses the lock when no changes are pending.
        var pending = pendingMigration();
        for (String module : new String[]{"backend", "worker"}) {
            try (var child = launch(module, pending)) {
                long end = System.nanoTime() + Duration.ofSeconds(30).toNanos();
                while (!child.logs().contains("Waiting for changelog lock") && child.process.isAlive() && System.nanoTime() < end) Thread.sleep(100);
                assertTrue(child.logs().contains("Waiting for changelog lock"), child.safeLogs());
                sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name='terma-" + module + "'");
                child.failed(60, "connection");
            }
        }
    }

    @Test void persistentLiquibaseLockFailsWithinBoundWithoutClearingTheOwner() throws Exception {
        worker();
        sql("UPDATE databasechangeloglock SET locked=true, lockedby='integration-test', lockgranted=CURRENT_TIMESTAMP");
        var pending = pendingMigration();
        for (String module : new String[]{"backend", "worker"}) {
            try (var child = launch(module, pending)) { child.failed(120, "Could not acquire change log lock"); }
        }
        assertEquals("true", scalar("SELECT locked::text FROM databasechangeloglock"));
        assertEquals("integration-test", scalar("SELECT lockedby FROM databasechangeloglock"));
        assertEquals("1", scalar("SELECT count(*) FROM databasechangelog"));
    }

    private final class Running implements AutoCloseable {
        private final Process process;
        private final Path output;
        private final String module;
        private final int port;

        Running(String module, Map<String, String> environment) throws Exception {
            this.module = module;
            try (var socket = new ServerSocket(0)) { port = socket.getLocalPort(); }
            output = Files.createTempFile(root.resolve("storage-integration/target"), module + "-", ".log");
            String java = Path.of(System.getProperty("java.home"), "bin", System.getProperty("os.name").startsWith("Windows") ? "java.exe" : "java").toString();
            var builder = new ProcessBuilder(java, "-jar", root.resolve(module + "/target/terma-" + module + ".jar").toString(), "--server.port=" + port);
            builder.directory(root.toFile()).redirectErrorStream(true).redirectOutput(output.toFile());
            // External Spring configuration on the runner must not select the test's database or profiles.
            builder.environment().keySet().removeIf(key -> key.startsWith("SPRING_") || key.startsWith("LIQUIBASE_"));
            builder.environment().putAll(environment);
            process = builder.start();
        }

        String logs() throws IOException { return Files.readString(output); }

        void ready() throws Exception {
            if (module.equals("worker")) {
                assertTrue(process.waitFor(60, TimeUnit.SECONDS), "Worker startup deadline");
                assertEquals(0, process.exitValue(), safeLogs());
                assertTrue(logs().contains("WORKER_BOOTSTRAP_OK; postgresql=MIGRATED"), safeLogs());
            } else {
                long end = System.nanoTime() + Duration.ofSeconds(60).toNanos();
                while (!logs().contains("Started BackendApplication") && process.isAlive() && System.nanoTime() < end) Thread.sleep(100);
                assertTrue(process.isAlive() && logs().contains("Started BackendApplication"), safeLogs());
                var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/actuator/health/liveness")).timeout(Duration.ofSeconds(3)).GET().build();
                assertEquals(200, HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString()).statusCode());
            }
            assertFalse(logs().contains(password), "Configured password must not appear in startup logs");
        }

        void failed(int seconds, String reason) throws Exception {
            assertTrue(process.waitFor(seconds, TimeUnit.SECONDS), "Negative startup deadline: " + module + "\n" + safeLogs());
            assertNotEquals(0, process.exitValue(), safeLogs());
            assertFalse(logs().contains("WORKER_BOOTSTRAP_OK"), safeLogs());
            assertFalse(logs().contains("Started BackendApplication"), safeLogs());
            assertTrue(logs().toLowerCase().contains(reason.toLowerCase()), safeLogs());
        }

        String safeLogs() throws IOException { return logs().replace(password, "[redacted]"); }

        @Override public void close() throws Exception {
            if (process.isAlive()) {
                process.destroy();
                if (!process.waitFor(10, TimeUnit.SECONDS)) {
                    process.destroyForcibly();
                    assertTrue(process.waitFor(5, TimeUnit.SECONDS), "Child process cleanup");
                }
            }
        }
    }
}
