package io.github.finnik723.terma.storage;

import java.sql.SQLException;
import liquibase.exception.LiquibaseException;
import liquibase.integration.spring.SpringLiquibase;

/** Serializes even the initial creation of Liquibase's history and lock tables. */
final class PostgreSqlLiquibase extends SpringLiquibase {
    @Override
    public void afterPropertiesSet() throws LiquibaseException {
        try (var connection = getDataSource().getConnection(); var statement = connection.createStatement()) {
            long deadline = System.nanoTime() + java.time.Duration.ofSeconds(45).toNanos();
            boolean locked = false;
            while (!locked) {
                try (var result = statement.executeQuery("SELECT pg_try_advisory_lock(190627, hashtext(current_schema()))")) {
                    result.next();
                    locked = result.getBoolean(1);
                }
                if (!locked) {
                    if (System.nanoTime() >= deadline) throw new LiquibaseException("Timed out waiting for migration startup lock");
                    Thread.sleep(200);
                }
            }
            try {
                super.afterPropertiesSet();
            } finally {
                statement.execute("SELECT pg_advisory_unlock(190627, hashtext(current_schema()))");
            }
        } catch (SQLException exception) {
            throw new LiquibaseException("PostgreSQL migration connection failed", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new LiquibaseException("Migration startup interrupted", exception);
        }
    }
}
