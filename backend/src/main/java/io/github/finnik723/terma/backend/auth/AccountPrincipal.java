package io.github.finnik723.terma.backend.auth;

import java.util.UUID;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.userdetails.User;

public final class AccountPrincipal extends User {
    private final UUID accountId;

    AccountPrincipal(UUID accountId, String username, String passwordHash, boolean enabled) {
        super(username, passwordHash, enabled, true, true, true, AuthorityUtils.createAuthorityList("ROLE_USER"));
        this.accountId = accountId;
    }

    public UUID accountId() { return accountId; }
}
