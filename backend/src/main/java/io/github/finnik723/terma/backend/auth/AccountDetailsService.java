package io.github.finnik723.terma.backend.auth;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class AccountDetailsService implements UserDetailsService {
    private final JdbcTemplate jdbc;
    public AccountDetailsService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Override public UserDetails loadUserByUsername(String username) {
        var accounts = jdbc.query("SELECT username, password_hash, enabled FROM user_account WHERE username = ?",
            (row, index) -> User.withUsername(row.getString("username"))
                .password(row.getString("password_hash")).disabled(!row.getBoolean("enabled"))
                .authorities("ROLE_USER").build(), username);
        if (accounts.isEmpty()) throw new UsernameNotFoundException("Invalid credentials");
        return accounts.getFirst();
    }
}
