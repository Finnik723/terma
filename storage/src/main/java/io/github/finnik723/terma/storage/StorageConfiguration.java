package io.github.finnik723.terma.storage;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.util.Locale;
import java.util.Properties;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import liquibase.integration.spring.SpringLiquibase;
import org.postgresql.Driver;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/** Shared startup path. No profile or property can silently replace PostgreSQL with an embedded DB. */
@Configuration(proxyBeanMethods = false)
public class StorageConfiguration {
    static String required(Environment environment, String key) {
        String value = environment.getProperty(key);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Missing required configuration: " + key);
        }
        return value;
    }

    static HikariConfig configuration(Environment environment) {
        String url = required(environment, "spring.datasource.url");
        String username = required(environment, "spring.datasource.username");
        String password = required(environment, "spring.datasource.password");
        // Reject credential-bearing URLs before the JDBC parser can log malformed input.
        String decoded;
        try { decoded = URLDecoder.decode(url, StandardCharsets.UTF_8); }
        catch (IllegalArgumentException invalid) { throw new IllegalArgumentException("Invalid JDBC URL encoding"); }
        if (decoded.contains("@") || decoded.toLowerCase(Locale.ROOT).matches(".*[?&](user|password|sslpassword)=.*")) {
            throw new IllegalArgumentException("Credentials are forbidden in JDBC URL; use separate datasource properties");
        }
        Properties parsed = Driver.parseURL(url, new Properties());
        if (parsed == null || !url.startsWith("jdbc:postgresql://")) {
            throw new IllegalArgumentException("spring.datasource.url must be an explicit PostgreSQL JDBC URL");
        }
        if (parsed.stringPropertyNames().stream().map(key -> key.toLowerCase(Locale.ROOT))
                .anyMatch(key -> key.equals("user") || key.contains("password"))) {
            throw new IllegalArgumentException("Credentials are forbidden in JDBC URL; use separate datasource properties");
        }
        var config = new HikariConfig();
        config.setPoolName("terma-postgresql");
        config.setJdbcUrl(url);
        config.setUsername(username);
        config.setPassword(password);
        config.setMaximumPoolSize(4);
        config.setMinimumIdle(0);
        config.setConnectionTimeout(10_000);
        config.setValidationTimeout(3_000);
        config.setInitializationFailTimeout(1);
        config.addDataSourceProperty("connectTimeout", "10");
        config.addDataSourceProperty("socketTimeout", "10");
        config.addDataSourceProperty("loginTimeout", "10");
        config.addDataSourceProperty("ApplicationName", environment.getProperty("spring.application.name", "terma"));
        return config;
    }

    @Bean(destroyMethod = "close")
    HikariDataSource dataSource(Environment environment) {
        return new HikariDataSource(configuration(environment));
    }

    @Bean
    SpringLiquibase liquibase(HikariDataSource dataSource, Environment environment) {
        var migration = new PostgreSqlLiquibase();
        migration.setDataSource(dataSource);
        migration.setChangeLog(environment.getProperty("spring.liquibase.change-log", "classpath:db/changelog/db.changelog-master.xml"));
        migration.setAnalyticsEnabled(false);
        migration.setCustomizer(database -> {
            var lock = liquibase.lockservice.LockServiceFactory.getInstance().getLockService(database.getDatabase());
            lock.setChangeLogLockWaitTime(1);
            lock.setChangeLogLockRecheckTime(1);
        });
        return migration;
    }
}
