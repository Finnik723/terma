package io.github.finnik723.terma.backend.auth;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.context.annotation.DependsOn;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;

/** Explicit, idempotent provisioning. Never updates an existing account or logs a password. */
@Component
@ConditionalOnProperty(name = "terma.demo-accounts.enabled", havingValue = "true")
@DependsOn("liquibase")
public class DemoAccounts implements InitializingBean {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final Environment environment;
    private final TransactionTemplate transaction;

    public DemoAccounts(JdbcTemplate jdbc, PasswordEncoder encoder, Environment environment, PlatformTransactionManager manager) {
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.environment = environment;
        this.transaction = new TransactionTemplate(manager);
    }

    static String password(Environment environment, String key) {
        String value = environment.getProperty(key);
        if (value == null || value.length() < 12 || value.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new IllegalArgumentException(key + " must contain at least 12 characters and at most 72 UTF-8 bytes");
        }
        return value;
    }

    @Override public void afterPropertiesSet() {
        String first = password(environment, "TERMA_DEMO_PASSWORD_1");
        String second = password(environment, "TERMA_DEMO_PASSWORD_2");
        if (first.equals(second)) throw new IllegalArgumentException("Demo passwords must differ");
        transaction.executeWithoutResult(status -> {
            insert("demo1", first);
            insert("demo2", second);
        });
    }

    private void insert(String username, String password) {
        jdbc.update("INSERT INTO user_account (id, username, password_hash) VALUES (?, ?, ?) ON CONFLICT (username) DO NOTHING",
            UUID.randomUUID(), username, encoder.encode(password));
    }
}
