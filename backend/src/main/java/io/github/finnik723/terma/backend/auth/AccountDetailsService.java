package io.github.finnik723.terma.backend.auth;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class AccountDetailsService implements UserDetailsService {
    private final JdbcTemplate jdbc;
    public AccountDetailsService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Override public UserDetails loadUserByUsername(String username) {
        var accounts = jdbc.query("SELECT id, username, password_hash, enabled FROM user_account WHERE username = ?",
            (row, index) -> new AccountPrincipal(row.getObject("id", UUID.class), row.getString("username"),
                row.getString("password_hash"), row.getBoolean("enabled")), username);
        if (accounts.isEmpty()) throw new UsernameNotFoundException("Invalid credentials");
        return accounts.getFirst();
    }
}
